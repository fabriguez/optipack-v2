'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Truck,
  Warehouse,
  Wallet,
  Download,
  Receipt,
  Loader2,
  Package,
  CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '@transitsoftservices/shared';
import { portalApi } from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import { CheckoutPanel } from '@/components/payments/CheckoutPanel';

interface Parcel {
  id: string;
  trackingNumber: string;
  designation: string;
  status: string;
  transportFee: number;
  storageFee: number;
  storageDays: number;
  storageWarehouseName?: string | null;
}

interface Payment {
  id: string;
  reference: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
}

interface InvoiceDetail {
  id: string;
  reference: string;
  status: string;
  currency: string;
  createdAt: string;
  agency?: { name: string; city?: string; country?: string; phone?: string } | null;
  parcels: Parcel[];
  payments: Payment[];
  fees: {
    transport: number;
    storage: number;
    discount: number;
    tax: number;
    net: number;
    advances: number;
    remaining: number;
  };
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a' },
  PARTIAL: { bg: 'rgba(234,179,8,0.15)', fg: '#ca8a04' },
  UNPAID: { bg: 'rgba(244,63,94,0.12)', fg: '#e11d48' },
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['portal', 'invoices', id],
    queryFn: () => portalApi.getInvoiceById(id),
    enabled: !!id,
  });

  const downloadReceipt = async (pay: Payment) => {
    setBusy(pay.id);
    try {
      await portalApi.downloadReceiptPdf(pay.id, pay.reference);
    } catch {
      toast.error('Telechargement impossible.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
      </div>
    );
  }

  const tone = STATUS_TONE[data.status] ?? {
    bg: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
    fg: 'var(--skin-primary)',
  };
  const fees = data.fees;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--skin-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2">
          <h1
            className="text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Facture {data.reference}
          </h1>
          <span
            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide skin-radius-sm"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {data.status}
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          {new Date(data.createdAt).toLocaleDateString('fr-FR')}
          {data.agency ? ` - ${data.agency.name}` : ''}
        </p>
      </motion.div>

      {/* Recapitulatif des frais */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 space-y-3 skin-card"
      >
        <FeeRow icon={Truck} label="Frais de transport" value={formatAmount(fees.transport, currency)} />
        <FeeRow icon={Warehouse} label="Frais de magasinage" value={formatAmount(fees.storage, currency)} />
        {fees.discount > 0 && (
          <FeeRow label="Remise" value={`- ${formatAmount(fees.discount, currency)}`} muted />
        )}
        {fees.tax > 0 && (
          <FeeRow label="TVA" value={formatAmount(fees.tax, currency)} muted />
        )}
        <div className="my-1 border-t" style={{ borderColor: 'var(--skin-border)' }} />
        <FeeRow label="Net a payer" value={formatAmount(fees.net, currency)} bold />
        <FeeRow icon={Wallet} label="Avances versees" value={`- ${formatAmount(fees.advances, currency)}`} muted />
        <div
          className="mt-2 flex items-center justify-between rounded-xl p-3"
          style={{ background: 'color-mix(in oklab, var(--skin-primary) 8%, transparent)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
            Reste a payer
          </span>
          <span
            className="text-xl font-bold skin-font-heading"
            style={{ color: fees.remaining > 0 ? '#b91c1c' : '#16a34a' }}
          >
            {formatAmount(fees.remaining, currency)}
          </span>
        </div>

        {fees.remaining > 0 && !paying && (
          <button
            type="button"
            onClick={() => setPaying(true)}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold skin-btn-primary"
          >
            <CreditCard className="h-4 w-4" />
            Payer le solde
          </button>
        )}
      </motion.section>

      {/* Paiement Mobile Money / carte */}
      {fees.remaining > 0 && paying && (
        <CheckoutPanel
          amount={fees.remaining}
          currency={currency}
          reference={data.reference}
          referenceType="INVOICE"
          customer={{ fullName: '' }}
          onSuccess={() => {
            toast.success('Paiement enregistre.');
            setPaying(false);
            qc.invalidateQueries({ queryKey: ['portal'] });
          }}
        />
      )}

      {/* Colis factures */}
      {data.parcels.length > 0 && (
        <section className="p-6 skin-card">
          <h2
            className="mb-3 text-lg font-semibold skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Colis factures
          </h2>
          <ul className="divide-y" style={{ borderColor: 'var(--skin-border)' }}>
            {data.parcels.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    {p.designation}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                    #{p.trackingNumber}
                    {p.storageFee > 0
                      ? ` - magasinage ${p.storageDays} j${
                          p.storageWarehouseName ? ` (${p.storageWarehouseName})` : ''
                        }`
                      : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
                    {formatAmount(Number(p.transportFee), currency)}
                  </p>
                  {p.storageFee > 0 && (
                    <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                      + {formatAmount(Number(p.storageFee), currency)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reglements + recus */}
      <section className="p-6 skin-card">
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-lg font-semibold skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            Reglements
          </h2>
          <button
            type="button"
            onClick={() => portalApi.downloadInvoicePdf(data.id, data.reference)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: 'var(--skin-primary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Facture PDF
          </button>
        </div>
        {data.payments.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: 'var(--skin-border)' }}>
            {data.payments.map((pay) => (
              <li key={pay.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
                    {formatAmount(Number(pay.amount), currency)}{' '}
                    <span style={{ color: 'var(--skin-muted)' }}>- {pay.paymentMethod}</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                    {new Date(pay.createdAt).toLocaleDateString('fr-FR')} - #{pay.reference}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === pay.id}
                  onClick={() => downloadReceipt(pay)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold skin-btn-ghost"
                >
                  {busy === pay.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Receipt className="h-3.5 w-3.5" />
                  )}
                  Recu
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-6 text-center">
            <Package className="mx-auto h-8 w-8" style={{ color: 'var(--skin-muted)' }} />
            <p className="mt-2 text-sm" style={{ color: 'var(--skin-muted)' }}>
              Aucun reglement pour le moment.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function FeeRow({
  icon: Icon,
  label,
  value,
  bold,
  muted,
}: {
  icon?: typeof Truck;
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="inline-flex items-center gap-2 text-sm"
        style={{
          color: muted ? 'var(--skin-muted)' : 'var(--skin-foreground)',
          fontWeight: bold ? 700 : 500,
        }}
      >
        {Icon && <Icon className="h-4 w-4" style={{ color: 'var(--skin-primary)' }} />}
        {label}
      </span>
      <span
        className="text-sm"
        style={{
          color: muted ? 'var(--skin-muted)' : 'var(--skin-foreground)',
          fontWeight: bold ? 700 : 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

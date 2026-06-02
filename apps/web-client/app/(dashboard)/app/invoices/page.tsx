'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Download, Receipt, Loader2, Search, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatAmount } from '@transitsoftservices/shared';
import { portalApi } from '@/lib/api/client';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

interface InvoicePayment {
  id: string;
  reference: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  reference: string;
  status: string;
  netAmount: number;
  paidAmount: number;
  balance: number;
  createdAt: string;
  payments?: InvoicePayment[];
}

interface InvoicesResponse {
  data: Invoice[];
  meta?: { total: number };
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a' },
  PARTIAL: { bg: 'rgba(234,179,8,0.15)', fg: '#ca8a04' },
  UNPAID: { bg: 'rgba(244,63,94,0.12)', fg: '#e11d48' },
};

export default function InvoicesPage() {
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ['portal', 'invoices', search, from, to],
    queryFn: () =>
      portalApi.getInvoices({
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const items = data?.data ?? [];

  const download = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.error('Telechargement impossible.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1
          className="text-3xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Factures et recus
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Telechargez vos factures et les recus de vos paiements.
        </p>
      </motion.div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-55 flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: 'var(--skin-muted)' }}
          />
          <input
            type="search"
            placeholder="Rechercher une reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="skin-input pl-10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--skin-muted)' }}>
            Du
          </label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="skin-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--skin-muted)' }}>
            Au
          </label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="skin-input"
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="px-3 py-2 text-sm font-medium skin-btn-ghost"
          >
            Reinitialiser
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 skin-card">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center skin-card">
          <FileText className="mx-auto h-10 w-10" style={{ color: 'var(--skin-muted)' }} />
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
            Aucune facture trouvee.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((inv) => {
            const tone = STATUS_TONE[inv.status] ?? {
              bg: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
              fg: 'var(--skin-primary)',
            };
            const payments = inv.payments ?? [];
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 skin-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link href={`/app/invoices/${inv.id}`} className="group min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className="text-sm font-bold skin-font-heading group-hover:underline"
                        style={{ color: 'var(--skin-foreground)' }}
                      >
                        {inv.reference}
                      </p>
                      <span
                        className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide skin-radius-sm"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {inv.status}
                      </span>
                      <ChevronRight
                        className="h-3.5 w-3.5"
                        style={{ color: 'var(--skin-muted)' }}
                      />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
                      {new Date(inv.createdAt).toLocaleDateString('fr-FR')} -{' '}
                      Net {formatAmount(Number(inv.netAmount), currency)} - Reste{' '}
                      {formatAmount(Number(inv.balance), currency)}
                    </p>
                  </Link>
                  <button
                    type="button"
                    disabled={busy === `inv-${inv.id}`}
                    onClick={() =>
                      download(`inv-${inv.id}`, () =>
                        portalApi.downloadInvoicePdf(inv.id, inv.reference),
                      )
                    }
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold skin-btn-primary"
                  >
                    {busy === `inv-${inv.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Facture
                  </button>
                </div>

                {payments.length > 0 && (
                  <div
                    className="mt-4 border-t pt-3"
                    style={{ borderColor: 'var(--skin-border)' }}
                  >
                    <p
                      className="mb-2 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--skin-muted)' }}
                    >
                      Recus de paiement
                    </p>
                    <ul className="space-y-2">
                      {payments.map((pay) => (
                        <li
                          key={pay.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p
                              className="truncate text-sm font-medium"
                              style={{ color: 'var(--skin-foreground)' }}
                            >
                              {formatAmount(Number(pay.amount), currency)}{' '}
                              <span style={{ color: 'var(--skin-muted)' }}>
                                - {pay.paymentMethod}
                              </span>
                            </p>
                            <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                              {new Date(pay.createdAt).toLocaleDateString('fr-FR')} - #
                              {pay.reference}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy === `pay-${pay.id}`}
                            onClick={() =>
                              download(`pay-${pay.id}`, () =>
                                portalApi.downloadReceiptPdf(pay.id, pay.reference),
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold skin-btn-ghost"
                          >
                            {busy === `pay-${pay.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Receipt className="h-3.5 w-3.5" />
                            )}
                            Recu
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

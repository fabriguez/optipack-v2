'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  Loader2,
  Package,
  MapPin,
  ArrowDown,
  CheckCircle2,
  Banknote,
  Tag,
  Building2,
  Cuboid,
  X,
} from 'lucide-react';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from 'sonner';
import { portalApi } from '@/lib/api/client';
import { AuthedImage } from '@/components/ui/AuthedImage';
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';
import {
  parcelStatusLabel,
  parcelStatusContextLabel,
  invoiceStatusLabel,
  paymentMethodLabel,
  parcelActionLabel,
  financialMovementLabel,
  PARCEL_STATUS_TONE,
} from '@/lib/labels';

const FLOW = ['IN_STOCK', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'DELIVERED'] as const;

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tracking = decodeURIComponent(id);
  const qc = useQueryClient();
  const { meta } = useTenantMeta();
  const currency = meta?.defaultCurrency ?? 'XAF';

  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: p, isLoading } = useQuery({
    queryKey: ['portal', 'parcels', tracking],
    queryFn: () => portalApi.getParcelByTracking(tracking),
    enabled: !!tracking,
  });

  const invoice = p?.invoice;
  const payments = p?.payments ?? [];
  const fees = p?.fees;
  const movements = p?.financialMovements ?? [];
  const remaining = invoice ? Number(invoice.balance ?? 0) : 0;
  const amt = (n: unknown) => formatAmount(Number(n ?? 0), currency);

  const payMutation = useMutation({
    mutationFn: () =>
      portalApi.declarePayment({ invoiceId: invoice?.id, amount: Number(amount) }),
    onSuccess: () => {
      toast.success('Declaration envoyee, votre agence va valider.');
      setPayOpen(false);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['portal', 'parcels', tracking] });
      qc.invalidateQueries({ queryKey: ['portal', 'invoices'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Echec de la declaration.'),
  });

  const submitPay = () => {
    const v = Number(amount);
    if (!v || v <= 0) return toast.error('Montant invalide.');
    if (v > remaining) return toast.error(`Trop eleve. Restant : ${amt(remaining)}`);
    payMutation.mutate();
  };

  const downloadLabel = async () => {
    try {
      await portalApi.downloadParcelLabel(tracking);
    } catch {
      toast.error('Telechargement impossible.');
    }
  };

  const downloadInvoice = async () => {
    if (!invoice?.id) return;
    try {
      await portalApi.downloadInvoicePdf(invoice.id, invoice.reference);
    } catch {
      toast.error('Telechargement impossible.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="py-24 text-center">
        <Package className="mx-auto h-10 w-10" style={{ color: 'var(--skin-muted)' }} />
        <p className="mt-3 text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
          Colis introuvable.
        </p>
        <Link
          href="/app/parcels"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: 'var(--skin-primary)' }}
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux colis
        </Link>
      </div>
    );
  }

  const tone = PARCEL_STATUS_TONE[p.status] ?? {
    bg: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
    fg: 'var(--skin-primary)',
  };
  const currentIdx = FLOW.indexOf(p.status);

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="min-w-0">
          <Link
            href="/app/parcels"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: 'var(--skin-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" /> Mes colis
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            {p.designation || 'Colis sans description'}
          </h1>
          <p className="mt-1 font-mono text-sm" style={{ color: 'var(--skin-muted)' }}>
            #{p.trackingNumber}
          </p>
          {(p.status === 'IN_TRANSIT' || p.status === 'ARRIVED') && (
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--skin-primary)' }}>
              {parcelStatusContextLabel(p)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide skin-radius-sm"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {parcelStatusLabel(p.status)}
          </span>
          <button
            type="button"
            onClick={downloadLabel}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-ghost"
          >
            <Download className="h-4 w-4" /> Ticket
          </button>
        </div>
      </motion.div>

      {/* Grille desktop : colonne principale + laterale */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Suivi (stepper horizontal) */}
          <section className="p-6 skin-card">
            <SectionTitle>Suivi</SectionTitle>
            <ol className="mt-5 flex items-start justify-between gap-2">
              {FLOW.map((step, i) => {
                const reached = i < currentIdx;
                const isCurrent = i === currentIdx;
                const done = reached || isCurrent;
                return (
                  <li key={step} className="relative flex flex-1 flex-col items-center text-center">
                    {i < FLOW.length - 1 && (
                      <span
                        className="absolute left-1/2 top-3.5 h-0.5 w-full"
                        style={{ background: reached ? 'var(--skin-primary)' : 'var(--skin-border)' }}
                      />
                    )}
                    <span
                      className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-white"
                      style={{
                        background: done ? 'var(--skin-primary)' : 'var(--skin-card)',
                        border: done ? 'none' : '2px solid var(--skin-border)',
                        color: done ? 'white' : 'var(--skin-muted)',
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span
                      className="mt-2 text-[11px] font-medium leading-tight"
                      style={{ color: done ? 'var(--skin-foreground)' : 'var(--skin-muted)' }}
                    >
                      {parcelStatusLabel(step)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Photos */}
          {p.images && p.images.length > 0 && (
            <section className="p-6 skin-card">
              <SectionTitle right={`${p.images.length} image${p.images.length > 1 ? 's' : ''}`}>
                Photos
              </SectionTitle>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.images.map((img: any, i: number) => {
                  const url = typeof img === 'string' ? img : img?.url;
                  if (!url) return null;
                  return (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => setLightbox(url)}
                      className="aspect-square overflow-hidden skin-radius border"
                      style={{ borderColor: 'var(--skin-border)' }}
                    >
                      <AuthedImage src={url} alt="" className="h-full w-full object-cover transition-transform hover:scale-105" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Trajet */}
          {(p.warehouse?.agency || p.destinationAgency) && (
            <section className="p-6 skin-card">
              <SectionTitle>Trajet</SectionTitle>
              <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <AgencyBlock title="Depart" agency={p.warehouse?.agency} />
                <div className="flex items-center justify-center">
                  <ArrowDown className="h-5 w-5 rotate-0 sm:-rotate-90" style={{ color: 'var(--skin-muted)' }} />
                </div>
                <AgencyBlock title="Destination" agency={p.destinationAgency} />
              </div>
              {p.transitRoute && (
                <div
                  className="mt-4 skin-radius p-4"
                  style={{ background: 'color-mix(in oklab, var(--skin-primary) 8%, transparent)' }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--skin-primary)' }}>
                    Route
                  </p>
                  <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
                    {p.transitRoute.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                    {p.transitRoute.departureCity} → {p.transitRoute.arrivalCity} · {p.transitRoute.type}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Historique */}
          {p.histories && p.histories.length > 0 && (
            <section className="p-6 skin-card">
              <SectionTitle>Historique</SectionTitle>
              <ol className="mt-4 space-y-4">
                {[...p.histories].reverse().map((h: any) => (
                  <li key={h.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: 'var(--skin-primary)' }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--skin-foreground)' }}>
                        {h.action
                          ? parcelActionLabel(h.action)
                          : `${parcelStatusLabel(h.statusBefore)} → ${parcelStatusLabel(h.statusAfter)}`}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                        {fmtDate(h.createdAt)}
                        {h.actorName ? ` · ${h.actorName}` : ''}
                        {h.warehouse?.name ? ` · ${h.warehouse.name}` : ''}
                      </p>
                      {h.comment && (
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--skin-muted)' }}>
                          {h.comment}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Colonne laterale */}
        <div className="space-y-6">
          {/* Caracteristiques */}
          <section className="p-6 skin-card">
            <SectionTitle>Caracteristiques</SectionTitle>
            <dl className="mt-3">
              <Row label="Poids" value={p.weight ? `${p.weight} kg` : null} />
              <Row label="Volume" value={p.volume ? `${p.volume} m³` : null} />
              <Row label="Prix" value={p.price != null ? amt(p.price) : null} />
              <Row label="Magasin" value={p.warehouse?.name} />
              <Row label="Conteneur" value={p.container?.designation} />
              <Row label="Destinataire" value={p.recipient?.fullName} />
              <Row label="Cree le" value={fmtDate(p.createdAt)} />
              <Row label="Observation" value={p.observation} />
            </dl>
          </section>

          {/* Facture */}
          {invoice && (
            <section className="p-6 skin-card">
              <SectionTitle
                right={
                  <span
                    className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide skin-radius-sm"
                    style={{
                      background:
                        invoice.status === 'PAID'
                          ? 'rgba(34,197,94,0.15)'
                          : 'rgba(234,179,8,0.15)',
                      color: invoice.status === 'PAID' ? '#16a34a' : '#ca8a04',
                    }}
                  >
                    {invoiceStatusLabel(invoice.status)}
                  </span>
                }
              >
                Facture
              </SectionTitle>
              <p className="mt-0.5 font-mono text-xs" style={{ color: 'var(--skin-muted)' }}>
                {invoice.reference}
              </p>
              <dl className="mt-3">
                <Row label="Frais de transport" value={fees ? amt(fees.transport) : null} />
                <Row label="Frais de magasinage" value={fees ? amt(fees.storage) : null} />
                {Number(fees?.discount ?? 0) > 0 && (
                  <Row label="Remise" value={`- ${amt(fees!.discount)}`} />
                )}
                <Row label="Total" value={amt(invoice.totalAmount)} strong />
                <Row label="Paye" value={amt(invoice.paidAmount)} />
                <Row label="Restant" value={amt(remaining)} strong />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadInvoice}
                  className="inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold skin-btn-ghost"
                >
                  <Download className="h-4 w-4" /> PDF
                </button>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAmount(String(remaining));
                      setPayOpen(true);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold skin-btn-primary"
                  >
                    Payer
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Paiements */}
          {payments.length > 0 && (
            <section className="p-6 skin-card">
              <SectionTitle right={`${payments.length}`}>Paiements</SectionTitle>
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--skin-border)' }}>
                {payments.map((pay: any) => (
                  <li key={pay.id} className="flex items-center gap-3 py-3">
                    <IconBubble>
                      <Banknote className="h-4 w-4" style={{ color: 'var(--skin-primary)' }} />
                    </IconBubble>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
                        {pay.reference ?? pay.id.slice(0, 8)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                        {paymentMethodLabel(pay.paymentMethod)} · {fmtDate(pay.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--skin-foreground)' }}>
                      {amt(pay.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Mouvements financiers */}
          {movements.length > 0 && (
            <section className="p-6 skin-card">
              <SectionTitle right={`${movements.length}`}>Mouvements financiers</SectionTitle>
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--skin-border)' }}>
                {movements.map((m: any) => {
                  const credit = m.direction === 'credit';
                  const Icon =
                    m.type === 'PAYMENT' ? Banknote : m.type === 'DISCOUNT' ? Tag : m.type === 'STORAGE' ? Building2 : Cuboid;
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-3">
                      <IconBubble muted={!credit}>
                        <Icon
                          className="h-4 w-4"
                          style={{ color: credit ? 'var(--skin-primary)' : 'var(--skin-muted)' }}
                        />
                      </IconBubble>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
                          {financialMovementLabel(m.type)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                          {(m.type === 'PAYMENT' ? paymentMethodLabel(m.label) : m.label) ?? ''}
                          {m.date ? ` · ${fmtDate(m.date)}` : ''}
                        </p>
                      </div>
                      <span
                        className="text-sm font-bold"
                        style={{ color: credit ? 'var(--skin-primary)' : 'var(--skin-foreground)' }}
                      >
                        {credit ? '- ' : '+ '}
                        {amt(m.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Modal declaration paiement */}
      {payOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setPayOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm p-6 skin-card"
          >
            <h2 className="text-lg font-semibold skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
              Declarer un paiement
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
              Restant : {amt(remaining)}
            </p>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant"
              autoFocus
              className="skin-input mt-4 w-full"
            />
            <p className="mt-2 text-xs" style={{ color: 'var(--skin-muted)' }}>
              Votre agence validera ce paiement. Vous recevrez une notification des confirmation.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="flex-1 px-3 py-2 text-sm font-medium skin-btn-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submitPay}
                disabled={payMutation.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold skin-btn-primary disabled:opacity-60"
              >
                {payMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Envoyer
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox image */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="h-7 w-7" />
          </button>
          <AuthedImage src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] object-contain" />
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold skin-font-heading" style={{ color: 'var(--skin-foreground)' }}>
        {children}
      </h2>
      {right != null && (
        <span className="text-xs font-medium" style={{ color: 'var(--skin-muted)' }}>
          {right}
        </span>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  if (value == null || value === '') return null;
  return (
    <div
      className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0"
      style={{ borderColor: 'var(--skin-border)' }}
    >
      <dt className="text-sm" style={{ color: 'var(--skin-muted)' }}>
        {label}
      </dt>
      <dd
        className={`text-right text-sm ${strong ? 'font-bold' : 'font-medium'}`}
        style={{ color: 'var(--skin-foreground)' }}
      >
        {String(value)}
      </dd>
    </div>
  );
}

function AgencyBlock({
  title,
  agency,
}: {
  title: string;
  agency?: { name?: string; city?: string; country?: string; googleMapsLink?: string | null } | null;
}) {
  if (!agency) {
    return (
      <div
        className="skin-radius border border-dashed p-4 text-sm"
        style={{ borderColor: 'var(--skin-border)', color: 'var(--skin-muted)' }}
      >
        {title} : —
      </div>
    );
  }
  return (
    <div className="skin-radius border p-4" style={{ borderColor: 'var(--skin-border)' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
        {title}
      </p>
      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
        {agency.name ?? '—'}
      </p>
      <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
        {[agency.city, agency.country].filter(Boolean).join(', ')}
      </p>
      {agency.googleMapsLink && (
        <a
          href={agency.googleMapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--skin-primary)' }}
        >
          <MapPin className="h-3.5 w-3.5" /> Voir sur la carte
        </a>
      )}
    </div>
  );
}

function IconBubble({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{
        background: muted
          ? 'color-mix(in oklab, var(--skin-muted) 14%, transparent)'
          : 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
      }}
    >
      {children}
    </span>
  );
}

import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CreditCard, Plus, User, Package, Building2, Eye, XCircle, Download, Percent } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RowActions } from '@/components/shared/RowActions';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { usePaymentsByInvoice } from '@/lib/hooks/usePayments';
import { usePermission } from '@/lib/hooks/usePermission';
import { Can } from '@/lib/components/Can';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { PaymentFormDialog } from '@/pages/payments/PaymentFormDialog';
import { InvoiceDiscountDialog } from './InvoiceDiscountDialog';
import { AuthedImage } from '@/components/shared/AuthedImage';
import { ImageLightbox } from '@/components/shared/ImageLightbox';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque',
};

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ parcelId: string; index: number; images: any[] } | null>(null);

  // Gating ABAC : meme cle que la route API POST /payments/:id/void
  const canVoidPayment = usePermission('payment.void');

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await apiClient.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `facture-${invoice?.reference || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback inutile : l'URL nue ne contient pas le header Authorization,
      // l'API repondra 401 dans le nouvel onglet. On laisse le toast d'erreur.
    }
    setPdfLoading(false);
  };

  const handleDownloadXlsx = async () => {
    setXlsxLoading(true);
    try {
      const res = await apiClient.get(`/invoices/${id}/xlsx`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `facture-${invoice?.reference || id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // noop
    }
    setXlsxLoading(false);
  };

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => apiClient.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: paymentsData } = usePaymentsByInvoice(id);

  const invoice = invoiceData?.data;

  if (isLoading) return <DashboardSkeleton />;
  if (!invoice) return <p className="p-6 text-gray-500">Facture introuvable</p>;

  // Detection colis perdus : si TOUS les colis lies sont LOST, on bloque le
  // paiement (regle metier : un colis perdu ne se paie pas, attendre
  // remboursement / annulation). Si certains LOST + d'autres OK, on
  // signale mais on autorise le paiement (les autres restent dus).
  const invoiceParcels: any[] = Array.isArray(invoice.parcels) ? invoice.parcels : [];
  const lostParcels = invoiceParcels.filter((p: any) => p.status === 'LOST');
  const allLost = invoiceParcels.length > 0 && lostParcels.length === invoiceParcels.length;
  const hasLost = lostParcels.length > 0;

  const netAmount = Number(invoice.netAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balance = Number(invoice.balance || 0);
  const paidPercent = netAmount > 0 ? Math.round((paidAmount / netAmount) * 100) : 0;

  const paymentColumns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <Link to={`/payments/${row.id}`} className="font-mono text-xs text-primary-700 font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.reference}
        </Link>
      ),
    },
    { key: 'amount', label: 'Montant', render: (row: any) => <span className="font-bold text-primary-700">{formatAmount(Number(row.amount))}</span> },
    { key: 'paymentMethod', label: 'Mode', render: (row: any) => METHOD_LABELS[row.paymentMethod] || row.paymentMethod },
    { key: 'isVoided', label: 'Statut', render: (row: any) => <AppBadge variant={row.isVoided ? 'error' : 'success'}>{row.isVoided ? 'Annule' : 'Valide'}</AppBadge> },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      label: '',
      render: (row: any) => (
        <RowActions
          actions={[
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/payments/${row.id}`) },
            ...(canVoidPayment ? [{ label: 'Annuler', icon: <XCircle className="h-4 w-4" />, onClick: () => navigate(`/payments/${row.id}`), variant: 'destructive' as const, disabled: row.isVoided }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Facture {invoice.reference}</h1>
                <StatusBadge status={invoice.status} type="invoice" />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Emise le {formatDate(invoice.issuedAt)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Can permission="invoice.export">
              <AppButton variant="outline" onClick={handleDownloadPdf} loading={pdfLoading}>
                <Download className="h-4 w-4" />
                PDF
              </AppButton>
              <AppButton variant="outline" onClick={handleDownloadXlsx} loading={xlsxLoading}>
                <Download className="h-4 w-4" />
                XLSX
              </AppButton>
            </Can>
            <Can permission="invoice.discount">
              <AppButton variant="outline" onClick={() => setShowDiscount(true)} disabled={invoice.status === 'PAID'}>
                <Percent className="h-4 w-4" />
                Remise
              </AppButton>
            </Can>
            <Can permission="payment.record">
              <AppButton onClick={() => setShowPayment(true)} disabled={invoice.status === 'PAID' || allLost}>
                <Plus className="h-4 w-4" />
                Enregistrer paiement
              </AppButton>
            </Can>
          </div>
        </div>

        {hasLost && (
          <div className={`rounded-xl border p-3 text-sm ${allLost ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">
              {allLost
                ? `Tous les colis de cette facture sont marques perdus (${lostParcels.length}).`
                : `${lostParcels.length} colis sur ${invoiceParcels.length} marque(s) perdu(s).`}
            </p>
            <p className="mt-0.5 text-xs">
              {allLost
                ? 'Aucun paiement ne peut etre enregistre sur cette facture. Prevoir un avoir / annulation.'
                : 'Les paiements restent autorises pour les colis non perdus de la facture.'}
            </p>
            {lostParcels.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {lostParcels.map((p: any) => (
                  <li key={p.id}>
                    <Link
                      to={`/parcels/${p.id}`}
                      className="inline-block rounded-md border border-red-200 bg-white px-2 py-0.5 font-mono text-[11px] text-red-700 hover:bg-red-100"
                    >
                      {p.trackingNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Summary bar */}
        <AppCard>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Montant net</p>
              <p className="text-xl font-bold text-gray-900">{formatAmount(netAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Paye</p>
              <p className="text-xl font-bold text-green-600">{formatAmount(paidAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Solde restant</p>
              <p className="text-xl font-bold text-red-600">{formatAmount(balance)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Progression</p>
              <div className="flex items-center gap-2">
                <div className="h-3 flex-1 rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(paidPercent, 100)}%` }} />
                </div>
                <span className="text-sm font-bold">{paidPercent}%</span>
              </div>
            </div>
          </div>
        </AppCard>

        {/* Info cards row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Client card */}
          <AppCard>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <User className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Client</p>
                {invoice.client ? (
                  <Link to={`/clients/${invoice.client.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {invoice.client.fullName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">-</p>
                )}
              </div>
            </div>
            {invoice.client?.phone && <p className="text-xs text-gray-500">{invoice.client.phone}</p>}
          </AppCard>

          {/* Parcels card */}
          <AppCard>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Package className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Colis</p>
                <p className="text-sm font-medium text-gray-900">{Array.isArray(invoice.parcels) ? invoice.parcels.length : 0}</p>
              </div>
            </div>
            {Array.isArray(invoice.parcels) && invoice.parcels.length > 0 && (
              <ul className="space-y-1">
                {invoice.parcels.slice(0, 3).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link to={`/parcels/${p.id}`} className="truncate font-mono text-primary-700 hover:underline">
                      {p.trackingNumber}
                    </Link>
                    <span className="text-gray-500">
                      {p.weight != null && Number(p.weight) > 0 ? `${Number(p.weight).toFixed(1)} kg` : null}
                      {p.weight != null && Number(p.weight) > 0 && p.volume != null && Number(p.volume) > 0 ? ' / ' : null}
                      {p.volume != null && Number(p.volume) > 0 ? `${Number(p.volume).toFixed(3)} m3` : null}
                      {(!p.weight || Number(p.weight) === 0) && (!p.volume || Number(p.volume) === 0) ? '-' : null}
                    </span>
                  </li>
                ))}
                {invoice.parcels.length > 3 && (
                  <li className="text-xs text-gray-400">+{invoice.parcels.length - 3} autre(s)...</li>
                )}
              </ul>
            )}
          </AppCard>

          {/* Agency card */}
          <AppCard>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Agence</p>
                {invoice.agency ? (
                  <Link to={`/agencies/${invoice.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {invoice.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">-</p>
                )}
              </div>
            </div>
          </AppCard>
        </div>

        {/* Detail par colis : tracking, designation, destinataire, images. */}
        {Array.isArray(invoice.parcels) && invoice.parcels.length > 0 && (
          <AppCard>
            <AppCardHeader
              title={`Detail des colis (${invoice.parcels.length})`}
              description="Destinataire, masse/volume, prix, images"
            />
            <div className="space-y-4">
              {invoice.parcels.map((p: any) => {
                const imgs: any[] = [
                  ...(p.imageUrl ? [{ id: 'cover', url: p.imageUrl, caption: 'Image principale' }] : []),
                  ...((p.images ?? []) as any[]),
                ].filter((img, idx, arr) => arr.findIndex((x) => x.url === img.url) === idx);
                return (
                  <div key={p.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <Link to={`/parcels/${p.id}`} className="font-mono text-sm font-bold text-primary-700 hover:underline">
                          {p.trackingNumber}
                        </Link>
                        <p className="text-sm text-gray-700 mt-0.5">{p.designation}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Prix transport</p>
                        <p className="text-base font-bold text-gray-900">{formatAmount(Number(p.price ?? 0))}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Destination</p>
                        <p className="text-sm font-medium text-gray-900 mt-0.5">{p.destination || '-'}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Masse / Volume</p>
                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                          {p.weight != null && Number(p.weight) > 0 ? `${Number(p.weight).toFixed(1)} kg` : null}
                          {p.weight != null && Number(p.weight) > 0 && p.volume != null && Number(p.volume) > 0 ? ' / ' : null}
                          {p.volume != null && Number(p.volume) > 0 ? `${Number(p.volume).toFixed(3)} m3` : null}
                          {(!p.weight || Number(p.weight) === 0) && (!p.volume || Number(p.volume) === 0) ? '-' : null}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Destinataire</p>
                        {p.recipient ? (
                          <div className="mt-0.5">
                            <p className="text-sm font-medium text-gray-900">{p.recipient.fullName}</p>
                            {p.recipient.phone && (
                              <p className="text-[11px] text-gray-500">{p.recipient.phone}</p>
                            )}
                            {p.recipient.email && (
                              <p className="text-[11px] text-gray-500 truncate">{p.recipient.email}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 mt-0.5">Non renseigne</p>
                        )}
                      </div>
                    </div>
                    {imgs.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Images ({imgs.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {imgs.map((img: any, idx: number) => (
                            <button
                              key={img.id || idx}
                              type="button"
                              onClick={() => setLightbox({ parcelId: p.id, index: idx, images: imgs })}
                              className="block h-20 w-20 overflow-hidden rounded-lg border border-gray-100 cursor-zoom-in"
                              aria-label="Agrandir image"
                            >
                              <AuthedImage src={img.url} alt={img.caption || 'Image colis'} className="h-full w-full object-cover transition-transform hover:scale-105" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AppCard>
        )}

        {/* Invoice details */}
        <AppCard>
          <AppCardHeader title="Details de facturation" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoItem label="Montant brut" value={formatAmount(Number(invoice.totalAmount))} />
            <InfoItem label="Remise" value={formatAmount(Number(invoice.discount))} />
            <InfoItem label="TVA" value={formatAmount(Number(invoice.tva))} />
            <InfoItem label="Devise" value={invoice.currency || 'XAF'} />
            {invoice.storageFeesTotal != null && Number(invoice.storageFeesTotal) > 0 && (
              <InfoItem
                label="Frais magasinage"
                value={formatAmount(Number(invoice.storageFeesTotal))}
              />
            )}
            {invoice.dueDate && <InfoItem label="Echeance" value={formatDate(invoice.dueDate)} />}
          </div>
        </AppCard>

        {/* Frais de magasinage detailles : 1 ligne par sejour (magasin /
            phase / periode). Permet au client de voir exactement ou et quand
            les frais se sont accumules (Chine, transit Douala, Yaounde, ...). */}
        {(() => {
          const allLines: any[] = [];
          if (Array.isArray(invoice.parcels)) {
            for (const p of invoice.parcels) {
              for (const l of (p.storageLines ?? [])) {
                if (l.phase === 'TRANSIT') continue;
                allLines.push({ ...l, parcelId: p.id, tracking: p.trackingNumber });
              }
            }
          }
          if (allLines.length === 0) return null;
          const phaseColor: Record<string, string> = {
            DEPARTURE: 'bg-blue-50 text-blue-700',
            DESTINATION: 'bg-emerald-50 text-emerald-700',
            TRANSIT: 'bg-gray-50 text-gray-500',
          };
          const phaseLabel: Record<string, string> = {
            DEPARTURE: 'Depart',
            DESTINATION: 'Destination',
            TRANSIT: 'Transit',
          };
          return (
            <AppCard>
              <AppCardHeader
                title={`Frais de magasinage detailles (${allLines.length} ligne${allLines.length > 1 ? 's' : ''})`}
                description={`Total : ${formatAmount(Number(invoice.storageFeesTotal || 0))}. 1 ligne = 1 sejour dans un magasin.`}
              />
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="p-2 text-left">Tracking</th>
                      <th className="p-2 text-left">Magasin</th>
                      <th className="p-2 text-left">Phase</th>
                      <th className="p-2 text-left">Periode</th>
                      <th className="p-2 text-right">Jours</th>
                      <th className="p-2 text-right">Tarif/jour</th>
                      <th className="p-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allLines.map((l: any, idx: number) => (
                      <tr key={`${l.parcelId}-${idx}`} className="hover:bg-gray-50 align-top">
                        <td className="p-2">
                          <Link
                            to={`/parcels/${l.parcelId}`}
                            className="font-mono text-xs text-primary-700 hover:underline"
                          >
                            {l.tracking}
                          </Link>
                        </td>
                        <td className="p-2 text-gray-700">
                          <div className="font-medium">{l.warehouseName || '-'}</div>
                          {l.warehouseCity && (
                            <div className="text-[11px] text-gray-400">{l.warehouseCity}</div>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${phaseColor[l.phase]}`}>
                            {phaseLabel[l.phase]}
                          </span>
                        </td>
                        <td className="p-2 text-gray-700 whitespace-nowrap text-xs">
                          {formatDate(l.startedAt)}
                          <span className="text-gray-400 mx-1">→</span>
                          {l.isActive ? <span className="text-amber-700 font-medium">en cours</span> : formatDate(l.endedAt)}
                        </td>
                        <td className="p-2 text-right text-gray-700 whitespace-nowrap">
                          <div>{l.chargedDays}</div>
                          <div className="text-[10px] text-gray-400">{l.freeDays} gratuit(s)</div>
                        </td>
                        <td className="p-2 text-right text-gray-700">{formatAmount(Number(l.dailyRate))}</td>
                        <td className="p-2 text-right font-semibold text-gray-900">{formatAmount(Number(l.feeAmount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AppCard>
          );
        })()}

        {/* Historique des remises : visible si au moins une remise a ete
            appliquee ou retiree. Permet de tracer le pourquoi et le quand. */}
        {Array.isArray(invoice.discountHistory) && invoice.discountHistory.length > 0 && (
          <AppCard>
            <AppCardHeader
              title={`Historique des remises (${invoice.discountHistory.length})`}
              description={`Remise actuelle : ${formatAmount(Number(invoice.discount))}`}
            />
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Action</th>
                    <th className="p-2 text-right">Avant</th>
                    <th className="p-2 text-right">Apres</th>
                    <th className="p-2 text-left">Raison</th>
                    <th className="p-2 text-left">Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.discountHistory.map((entry: any) => {
                    const c = entry.changes || {};
                    const prev = Number(c.previousDiscount ?? 0);
                    const next = Number(c.newDiscount ?? 0);
                    const isApplied = entry.action === 'DISCOUNT_APPLIED';
                    const user = entry.user
                      ? `${entry.user.firstName ?? ''} ${entry.user.lastName ?? ''}`.trim() || '-'
                      : '-';
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 align-top">
                        <td className="p-2 text-gray-700 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                        <td className="p-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            isApplied ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {isApplied ? 'Appliquee' : 'Retiree'}
                          </span>
                        </td>
                        <td className="p-2 text-right text-gray-500">{formatAmount(prev)}</td>
                        <td className="p-2 text-right font-semibold text-gray-900">{formatAmount(next)}</td>
                        <td className="p-2 text-gray-700">{c.reason || '-'}</td>
                        <td className="p-2 text-gray-700">{user}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AppCard>
        )}

        {/* Payments */}
        <AppCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Paiements ({paymentsData?.data?.length || 0})</h3>
            <div className="flex items-center gap-2">
              <Can permission="payment.record">
                <AppButton size="sm" onClick={() => setShowPayment(true)} disabled={invoice.status === 'PAID' || allLost}>
                  <Plus className="h-3.5 w-3.5" />
                  Enregistrer paiement
                </AppButton>
              </Can>
            </div>
          </div>
          <AppDataTable
            columns={paymentColumns}
            data={paymentsData?.data || []}
            onRowClick={(row) => navigate(`/payments/${row.id}`)}
          />
        </AppCard>
      </div>

      <PaymentFormDialog open={showPayment} onClose={() => setShowPayment(false)} invoiceId={id} />
      <InvoiceDiscountDialog
        open={showDiscount}
        onClose={() => setShowDiscount(false)}
        invoice={invoice ? { id: invoice.id, totalAmount: invoice.totalAmount, discount: invoice.discount, paidAmount: invoice.paidAmount } : null}
      />

      <ImageLightbox
        images={(lightbox?.images ?? []).map((img: any) => ({ url: img.url, caption: img.caption }))}
        index={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
        onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
      />
    </PageTransition>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

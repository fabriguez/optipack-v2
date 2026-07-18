'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, FileText, Download, Eye } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AuthedImage, openAuthedFile } from '@/components/shared/AuthedImage';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import { Can } from '@/lib/components/Can';
import { useQuery } from '@tanstack/react-query';
import { useVoidPayment } from '@/lib/hooks/usePayments';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { MaskedValue, isMasked } from '@/components/ui/MaskedValue';
import { useState } from 'react';

interface PaymentAttachment {
  id: string;
  url: string;
  key: string;
  kind: 'IMAGE' | 'PDF' | 'OTHER';
  caption: string | null;
  createdAt?: string;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque',
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const voidMutation = useVoidPayment();

  const { data, isLoading } = useQuery({
    queryKey: ['payments', id],
    queryFn: () => apiClient.get(`/payments/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const payment = data?.data;

  if (isLoading) return <DashboardSkeleton />;
  if (!payment) return <p className="p-6 text-gray-500">Paiement introuvable</p>;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Paiement {payment.reference}</h1>
                <AppBadge variant={payment.isVoided ? 'error' : 'success'}>
                  {payment.isVoided ? 'Annule' : 'Valide'}
                </AppBadge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(payment.createdAt)}</p>
            </div>
          </div>
          {!payment.isVoided && (
            <Can permission="payment.void">
              <AppButton variant="destructive" onClick={() => setShowVoid(true)}>
                <AlertTriangle className="h-4 w-4" />
                Annuler le paiement
              </AppButton>
            </Can>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AppCard>
            <AppCardHeader title="Details du paiement" />
            <div className="space-y-4">
              <DetailRow label="Reference" value={payment.reference} mono />
              <DetailRow label="Montant" value={formatAmount(Number(payment.amount))} bold />
              <DetailRow label="Mode de paiement" value={METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod} />
              <DetailRow label="Agence encaisseuse" value={payment.agency?.name || '-'} />
              {isMasked(payment.receivedBy)
                ? <div className="flex justify-between py-1"><span className="text-sm text-gray-500">Recu par</span><MaskedValue value={payment.receivedBy} /></div>
                : <DetailRow label="Recu par" value={payment.receivedBy ? `${payment.receivedBy.firstName} ${payment.receivedBy.lastName}` : '-'} />}
              {payment.discount > 0 && <DetailRow label="Remise" value={formatAmount(Number(payment.discount))} />}
              {payment.transactionReference && <DetailRow label="Ref. transaction" value={payment.transactionReference} mono />}
            </div>
          </AppCard>

          <AppCard>
            <AppCardHeader title="Facture associee" />
            <div className="space-y-4">
              <DetailRow label="Reference facture" value={payment.invoice?.reference || '-'} mono />
              <AppButton variant="outline" className="w-full" onClick={() => payment.invoice && router.push(`/invoices/${payment.invoice.id}`)}>
                Voir la facture
              </AppButton>
            </div>

            {payment.isVoided && (
              <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4">
                <p className="text-sm font-semibold text-red-800">Paiement annule</p>
                <p className="text-sm text-red-600 mt-1">Motif : {payment.voidReason}</p>
                <p className="text-xs text-red-400 mt-1">Le {formatDateTime(payment.voidedAt)}</p>
              </div>
            )}
          </AppCard>
        </div>

        {payment.attachments?.length > 0 && (
          <PaymentAttachments attachments={payment.attachments} />
        )}

        <ConfirmDialog
          open={showVoid}
          onClose={() => setShowVoid(false)}
          onConfirm={() => {
            voidMutation.mutate({ id, reason: voidReason || 'Annulation manuelle' });
            setShowVoid(false);
          }}
          title="Annuler ce paiement"
          message="Cette action creera une ecriture comptable inverse. Le paiement ne sera pas supprime mais marque comme annule. Cette action est irreversible."
          confirmLabel="Annuler le paiement"
          variant="destructive"
          loading={voidMutation.isPending}
        />
      </div>
    </PageTransition>
  );
}

/**
 * Pieces jointes du paiement (photos + justificatifs), en lecture seule.
 * Les images sont fournies embarquees dans GET /payments/:id (payment.attachments)
 * — pas d'endpoint /payments/:id/attachments dedie. URLs protegees -> AuthedImage.
 */
function PaymentAttachments({ attachments }: { attachments: PaymentAttachment[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = attachments.filter((a) => a.kind === 'IMAGE');
  const docs = attachments.filter((a) => a.kind !== 'IMAGE');

  return (
    <AppCard>
      <AppCardHeader
        title={`Pieces jointes (${attachments.length})`}
        description="Photos et justificatifs ajoutes lors de l'encaissement"
      />
      <div className="space-y-4">
        {images.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Images ({images.length})</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img, idx) => (
                <div key={img.id} className="group relative overflow-hidden rounded-xl border border-gray-100">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="block h-28 w-full cursor-zoom-in"
                    aria-label="Agrandir image"
                  >
                    <AuthedImage src={img.url} alt={img.caption || 'Justificatif'} className="h-28 w-full object-cover transition-transform group-hover:scale-105" />
                  </button>
                  {img.caption && (
                    <p className="px-2 py-1 text-xs text-gray-600 truncate">{img.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {docs.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Documents ({docs.length})</p>
            <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-red-500" />
                    <p className="truncate text-sm font-medium text-gray-900">{d.caption || '(sans legende)'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openAuthedFile(d.url).catch(() => {})}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-700"
                      title="Ouvrir"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void openAuthedFile(d.url, d.caption || `document-${d.id}`, true).catch(() => {})}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-700"
                      title="Telecharger"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ImageLightbox
        images={images.map((img) => ({ url: img.url, caption: img.caption }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </AppCard>
  );
}

function DetailRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'text-lg font-bold text-primary-700' : 'font-medium text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}

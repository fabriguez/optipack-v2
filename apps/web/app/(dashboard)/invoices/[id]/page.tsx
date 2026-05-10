'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, CreditCard, Plus, User, Package, Building2, Eye, XCircle, Download } from 'lucide-react';
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
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { PaymentFormDialog } from '../../payments/PaymentFormDialog';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte', CHECK: 'Cheque',
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => apiClient.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: paymentsData } = usePaymentsByInvoice(id);

  const invoice = invoiceData?.data;

  if (isLoading) return <DashboardSkeleton />;
  if (!invoice) return <p className="p-6 text-gray-500">Facture introuvable</p>;

  const netAmount = Number(invoice.netAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balance = Number(invoice.balance || 0);
  const paidPercent = netAmount > 0 ? Math.round((paidAmount / netAmount) * 100) : 0;

  const paymentColumns = [
    {
      key: 'reference',
      label: 'Reference',
      render: (row: any) => (
        <Link href={`/payments/${row.id}`} className="font-mono text-xs text-primary-700 font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
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
            { label: 'Voir', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/payments/${row.id}`) },
            { label: 'Annuler', icon: <XCircle className="h-4 w-4" />, onClick: () => router.push(`/payments/${row.id}`), variant: 'destructive' as const, disabled: row.isVoided },
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
            <button onClick={() => router.back()} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
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
            <AppButton variant="outline" onClick={handleDownloadPdf} loading={pdfLoading}>
              <Download className="h-4 w-4" />
              Telecharger PDF
            </AppButton>
            <AppButton onClick={() => setShowPayment(true)} disabled={invoice.status === 'PAID'}>
              <Plus className="h-4 w-4" />
              Enregistrer paiement
            </AppButton>
          </div>
        </div>

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
                  <Link href={`/clients/${invoice.client.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {invoice.client.fullName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">-</p>
                )}
              </div>
            </div>
            {invoice.client?.phone && <p className="text-xs text-gray-500">{invoice.client.phone}</p>}
          </AppCard>

          {/* Parcel card */}
          <AppCard>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Package className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Colis</p>
                {invoice.parcel ? (
                  <Link href={`/parcels/${invoice.parcel.id}`} className="font-mono text-sm font-medium text-primary-700 hover:underline">
                    {invoice.parcel.trackingNumber}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">-</p>
                )}
              </div>
            </div>
            {invoice.parcel?.designation && <p className="text-xs text-gray-500">{invoice.parcel.designation}</p>}
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
                  <Link href={`/agencies/${invoice.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {invoice.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">-</p>
                )}
              </div>
            </div>
          </AppCard>
        </div>

        {/* Invoice details */}
        <AppCard>
          <AppCardHeader title="Details de facturation" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoItem label="Montant brut" value={formatAmount(Number(invoice.totalAmount))} />
            <InfoItem label="Remise" value={formatAmount(Number(invoice.discount))} />
            <InfoItem label="TVA" value={formatAmount(Number(invoice.tva))} />
            <InfoItem label="Devise" value={invoice.currency || 'XAF'} />
            {invoice.dueDate && <InfoItem label="Echeance" value={formatDate(invoice.dueDate)} />}
          </div>
        </AppCard>

        {/* Payments */}
        <AppCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Paiements ({paymentsData?.data?.length || 0})</h3>
            <div className="flex items-center gap-2">
              <AppButton size="sm" onClick={() => setShowPayment(true)} disabled={invoice.status === 'PAID'}>
                <Plus className="h-3.5 w-3.5" />
                Enregistrer paiement
              </AppButton>
            </div>
          </div>
          <AppDataTable
            columns={paymentColumns}
            data={paymentsData?.data || []}
            onRowClick={(row) => router.push(`/payments/${row.id}`)}
          />
        </AppCard>
      </div>

      <PaymentFormDialog open={showPayment} onClose={() => setShowPayment(false)} invoiceId={id} />
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

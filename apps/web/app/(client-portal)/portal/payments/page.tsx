'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CreditCard, History, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Invoice {
  id: string;
  reference: string;
  totalAmount: string | number;
  paidAmount: string | number;
  balance: string | number;
  status: string;
}

interface Payment {
  id: string;
  reference: string;
  amount: string | number;
  paymentMethod: string;
  createdAt: string;
  invoice: { reference: string; totalAmount: string | number; status: string };
}

const PAYMENT_METHODS = [
  { code: 'MTN_MOMO', label: 'MTN Mobile Money' },
  { code: 'ORANGE_MONEY', label: 'Orange Money' },
  { code: 'WAVE', label: 'Wave' },
  { code: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { code: 'CASH', label: 'Especes (en agence)' },
];

function formatAmount(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export default function PortalPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedInvoiceId = searchParams.get('invoiceId') ?? '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [invoiceId, setInvoiceId] = useState(preselectedInvoiceId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0].code);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: 'ok' | 'err'; message: string } | null
  >(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      clientPortalApi
        .getInvoices({ page: 1, limit: 100 })
        .then((r) => (r.data?.items || r.data || []) as Invoice[]),
      clientPortalApi
        .getPayments({ page: 1, limit: 20 })
        .then((r) => (r.data?.items || r.data || []) as Payment[]),
    ])
      .then(([inv, pay]) => {
        setInvoices(inv);
        setPayments(pay);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const unpaid = useMemo(
    () =>
      invoices.filter(
        (i) =>
          i.status !== 'PAID' &&
          i.status !== 'CANCELLED' &&
          Number(i.balance) > 0,
      ),
    [invoices],
  );

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.id === invoiceId) ?? null,
    [invoiceId, invoices],
  );

  useEffect(() => {
    if (selectedInvoice && !amount) {
      setAmount(String(selectedInvoice.balance));
    }
  }, [selectedInvoice, amount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!invoiceId) {
      setFeedback({ kind: 'err', message: 'Selectionnez une facture.' });
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({ kind: 'err', message: 'Montant invalide.' });
      return;
    }
    if (selectedInvoice && amt > Number(selectedInvoice.balance)) {
      setFeedback({
        kind: 'err',
        message: 'Le montant depasse le solde restant.',
      });
      return;
    }
    setSubmitting(true);
    try {
      await clientPortalApi.declarePayment({
        invoiceId,
        amount: amt,
        paymentMethod: method,
        transactionReference: reference || undefined,
        note: note || undefined,
      });
      setFeedback({
        kind: 'ok',
        message:
          'Declaration envoyee. L\'agence va verifier et confirmer votre paiement.',
      });
      setAmount('');
      setReference('');
      setNote('');
      reload();
    } catch (err: any) {
      setFeedback({
        kind: 'err',
        message:
          err?.response?.data?.message ??
          'Erreur lors de la declaration. Reessayez.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paiements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Declarez un paiement effectue par Mobile Money ou virement.
            L&apos;agence confirmera la reception.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Formulaire */}
          <AppCard>
            <AppCardHeader title="Declarer un paiement" />
            {loading ? (
              <div className="space-y-3">
                <AppSkeleton className="h-10" />
                <AppSkeleton className="h-10" />
                <AppSkeleton className="h-10" />
              </div>
            ) : unpaid.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Aucune facture en attente de paiement.
              </p>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Facture
                  </label>
                  <select
                    value={invoiceId}
                    onChange={(e) => {
                      setInvoiceId(e.target.value);
                      setAmount('');
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    required
                  >
                    <option value="">-- Choisir --</option>
                    {unpaid.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.reference} - reste {formatAmount(inv.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Montant (XAF)
                  </label>
                  <AppInput
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Mode de paiement
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Reference / ID transaction (optionnel)
                  </label>
                  <AppInput
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex: MOMO123456789"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Note (optionnel)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>

                {feedback && (
                  <div
                    className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                      feedback.kind === 'ok'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {feedback.kind === 'ok' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <p>{feedback.message}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => router.push('/portal/invoices')}
                  >
                    Annuler
                  </AppButton>
                  <AppButton type="submit" loading={submitting}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Declarer
                  </AppButton>
                </div>
              </form>
            )}
          </AppCard>

          {/* Historique */}
          <AppCard>
            <AppCardHeader title="Historique des paiements" />
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <AppSkeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <History className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-400">Aucun paiement enregistre.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-700">
                        {p.reference}
                      </p>
                      <p className="text-xs text-gray-500">
                        Facture {p.invoice.reference}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {p.paymentMethod} -{' '}
                        {new Date(p.createdAt).toLocaleString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-700">
                        {formatAmount(p.amount)}
                      </p>
                      <AppBadge variant="success">Encaisse</AppBadge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AppCard>
        </div>
      </div>
    </PageTransition>
  );
}

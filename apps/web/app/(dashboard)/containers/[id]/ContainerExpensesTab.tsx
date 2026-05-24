'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, CreditCard, CheckCircle2, Clock, Lock, Sparkles, GitBranch, ExternalLink, Trash2, Edit } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

interface Expense {
  id: string;
  title: string;
  reason: string;
  description: string | null;
  category: string | null;
  amount: number | string;
  isPaid: boolean;
  paidAt: string | null;
  cashRegisterId: string | null;
  paidBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  cashRegister: { id: string; date: string } | null;
  createdAt: string;
  isAutoFromForwarding?: boolean;
  parentExpenseId?: string | null;
  parentExpense?: {
    id: string;
    title: string;
    amount: number | string;
    containerId: string | null;
    container: { id: string; designation: string; isForwarding: boolean } | null;
  } | null;
  childExpenses?: Array<{
    id: string;
    amount: number | string;
    containerId: string | null;
    container: { id: string; designation: string } | null;
  }>;
}

export function ContainerExpensesTab({ containerId }: { containerId: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Expense | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['containers', containerId, 'expenses'],
    queryFn: () => apiClient.get(`/expenses/container/${containerId}`).then((r) => r.data),
  });

  const { data: containerData } = useQuery({
    queryKey: ['containers', containerId, 'meta-for-expenses'],
    queryFn: () => apiClient.get(`/containers/${containerId}`).then((r) => r.data),
  });
  const container = containerData?.data;
  const isClosed = !!container?.expensesClosedAt;
  const isForwarding = !!container?.isForwarding;
  const parcelCount = container?._count?.parcels ?? container?.parcels?.length ?? 0;

  const expenses: Expense[] = data?.data ?? [];
  const totalUnpaid = expenses.filter((e) => !e.isPaid).reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid = expenses.filter((e) => e.isPaid).reduce((s, e) => s + Number(e.amount), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['containers', containerId, 'expenses'] });
    qc.invalidateQueries({ queryKey: ['containers', containerId, 'meta-for-expenses'] });
  };

  const closeMutation = useMutation({
    mutationFn: () => apiClient.post(`/expenses/container/${containerId}/close`),
    onSuccess: () => {
      toast.success('Depenses cloturees');
      setConfirmClose(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec cloture'),
  });

  // Scroll automatique vers une depense via hash (#expense-<id>) au mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#expense-')) return;
    setTimeout(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary-400');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary-400'), 2500);
      }
    }, 500);
  }, [expenses.length]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="A payer" value={formatAmount(totalUnpaid)} tone="warning" />
        <Stat label="Paye" value={formatAmount(totalPaid)} tone="success" />
        <Stat label="Total depenses" value={formatAmount(totalUnpaid + totalPaid)} />
      </div>

      {isClosed && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Lock className="h-3.5 w-3.5" />
          Depenses cloturees le {container?.expensesClosedAt ? formatDate(container.expensesClosedAt) : '-'}. Aucun ajout manuel autorise.
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Depenses du conteneur {isForwarding && <span className="text-xs text-purple-600">(acheminement)</span>}
        </h3>
        <div className="flex items-center gap-2">
          {!isClosed && (
            <AppButton size="sm" variant="outline" onClick={() => setConfirmClose(true)} disabled={parcelCount > 0}>
              <Lock className="h-3.5 w-3.5" />
              Cloturer les depenses
            </AppButton>
          )}
          {!isClosed && (
            <AppButton size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter une depense
            </AppButton>
          )}
        </div>
      </div>
      {!isClosed && parcelCount > 0 && (
        <p className="text-[11px] text-gray-500">
          Cloture impossible : {parcelCount} colis encore present(s) dans le conteneur.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : expenses.length === 0 ? (
        <AppCard><p className="py-6 text-center text-sm text-gray-400">Aucune depense.</p></AppCard>
      ) : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <ExpenseCard
              key={e.id}
              expense={e}
              onPay={() => setPayTarget(e)}
              onDelete={async () => {
                if (!confirm(`Supprimer la depense "${e.title}"? Les depenses auto liees seront aussi supprimees.`)) return;
                try {
                  await apiClient.delete(`/expenses/${e.id}`);
                  toast.success('Depense supprimee');
                  invalidate();
                } catch (err: any) {
                  toast.error(err?.response?.data?.message || 'Echec suppression');
                }
              }}
              disabled={isClosed}
            />
          ))}
        </ul>
      )}

      <CreateExpenseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        containerId={containerId}
        onCreated={() => { invalidate(); setCreateOpen(false); }}
      />
      <PayExpenseDialog
        expense={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => { invalidate(); setPayTarget(null); }}
      />

      <AppDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Cloturer les depenses du conteneur"
        size="md"
        footer={
          <>
            <AppButton variant="ghost" onClick={() => setConfirmClose(false)}>Annuler</AppButton>
            <AppButton onClick={() => closeMutation.mutate()} loading={closeMutation.isPending} variant="destructive">
              <Lock className="h-4 w-4" />
              Cloturer (irreversible)
            </AppButton>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          La cloture est <strong>irreversible</strong>. Plus aucune depense manuelle ne pourra etre ajoutee, modifiee ou supprimee.
          Seules les propagations automatiques depuis un conteneur d&apos;acheminement restent autorisees.
        </p>
      </AppDialog>
    </div>
  );
}

function ExpenseCard({ expense: e, onPay, onDelete, disabled }: { expense: Expense; onPay: () => void; onDelete: () => void; disabled: boolean }) {
  const isAuto = !!e.isAutoFromForwarding;
  const hasChildren = (e.childExpenses?.length ?? 0) > 0;
  const childTotal = (e.childExpenses ?? []).reduce((s, c) => s + Number(c.amount), 0);

  return (
    <li id={`expense-${e.id}`} className="rounded-xl border border-gray-100 bg-white p-3 transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{e.title}</p>
            {e.isPaid ? (
              <AppBadge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Paye</AppBadge>
            ) : (
              <AppBadge variant="warning"><Clock className="mr-1 h-3 w-3" />A payer</AppBadge>
            )}
            {e.category && <AppBadge variant="default">{e.category}</AppBadge>}
            {isAuto && (
              <AppBadge variant="info">
                <Sparkles className="mr-1 h-3 w-3" />AUTO
              </AppBadge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500 truncate">{e.reason}</p>
          {e.description && <p className="mt-1 whitespace-pre-line text-xs text-gray-600">{e.description}</p>}

          {/* Lien vers la depense forwarding parente si AUTO */}
          {isAuto && e.parentExpense?.container && (
            <Link
              href={`/containers/${e.parentExpense.container.id}?tab=expenses#expense-${e.parentExpense.id}`}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 hover:bg-purple-100"
            >
              <GitBranch className="h-3 w-3" />
              Source : conteneur d&apos;acheminement {e.parentExpense.container.designation}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          {/* Arbre breakdown si depense forwarding propagee */}
          {hasChildren && (
            <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
                Propage aux conteneurs parents ({formatAmount(childTotal)} total)
              </p>
              <ul className="mt-1 space-y-1">
                {(e.childExpenses ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-[11px]">
                    <Link
                      href={`/containers/${c.containerId}?tab=expenses#expense-${c.id}`}
                      className="inline-flex items-center gap-1 text-purple-700 hover:underline"
                    >
                      <GitBranch className="h-3 w-3" />
                      {c.container?.designation ?? c.containerId}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <span className="font-medium text-gray-700">{formatAmount(Number(c.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-1 text-[11px] text-gray-400">
            Cree le {formatDate(e.createdAt)}{e.approvedBy && ` par ${e.approvedBy.firstName} ${e.approvedBy.lastName}`}
            {e.paidAt && e.paidBy && ` - paye le ${formatDate(e.paidAt)} par ${e.paidBy.firstName} ${e.paidBy.lastName}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-gray-900">{formatAmount(Number(e.amount))}</p>
          <div className="mt-2 flex flex-col items-end gap-1">
            {!e.isPaid && (
              <AppButton size="sm" variant="outline" onClick={onPay}>
                <CreditCard className="h-3.5 w-3.5" />
                Payer
              </AppButton>
            )}
            {!e.isPaid && !isAuto && !disabled && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'text-green-600' : tone === 'warning' ? 'text-amber-600' : 'text-gray-900';
  return (
    <AppCard padding="sm">
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${color}`}>{value}</p>
    </AppCard>
  );
}

function CreateExpenseDialog({ open, onClose, containerId, onCreated }: { open: boolean; onClose: () => void; containerId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CONTAINER');
  const [amount, setAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/expenses/container/${containerId}`, {
        title,
        reason: reason || title,
        description: description || undefined,
        category,
        amount: Number(amount),
      }),
    onSuccess: () => {
      toast.success('Depense ajoutee');
      setTitle(''); setReason(''); setDescription(''); setAmount('');
      onCreated();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec'),
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouvelle depense conteneur"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!title.trim() || !amount || Number(amount) <= 0}>
            Enregistrer (non payee)
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <AppInput label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <AppInput label="Motif" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defaut = titre" />
        <AppTextarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <AppInput label="Categorie" value={category} onChange={(e) => setCategory(e.target.value)} />
          <AppInput label="Montant" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
      </div>
    </AppDialog>
  );
}

function PayExpenseDialog({ expense, onClose, onPaid }: { expense: Expense | null; onClose: () => void; onPaid: () => void }) {
  const [note, setNote] = useState('');
  const [agencyId, setAgencyId] = useState<string>('');

  // Liste des agences accessibles a l'utilisateur (pour selectionner l'agence
  // payeuse). Par defaut on laisse vide -> backend utilise expense.agencyId.
  const { data: agenciesData } = useQuery({
    queryKey: ['agencies', 'list-for-pay'],
    queryFn: () => apiClient.get('/agencies', { params: { limit: 100 } }).then((r) => r.data),
    enabled: !!expense,
  });
  const agencies: Array<{ id: string; name: string; code?: string }> = agenciesData?.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/expenses/${expense!.id}/pay`, {
        note: note || undefined,
        agencyId: agencyId || undefined,
      }),
    onSuccess: () => {
      toast.success('Depense payee');
      setNote('');
      setAgencyId('');
      onPaid();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec paiement'),
  });

  return (
    <AppDialog
      open={!!expense}
      onClose={onClose}
      title={expense ? `Payer ${expense.title} (${formatAmount(Number(expense.amount))})` : 'Payer'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending}>
            <CreditCard className="h-4 w-4" />
            Payer depuis caisse du jour
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Selectionnez l&apos;agence payeuse. Par defaut = agence de rattachement de la depense. La caisse du jour de cette agence sera debitee.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Agence payeuse</label>
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="">Agence par defaut (rattachement depense)</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.code ? ` (${a.code})` : ''}
              </option>
            ))}
          </select>
        </div>
        <AppTextarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optionnel" />
      </div>
    </AppDialog>
  );
}

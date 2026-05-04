'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAgencyChargeSchema,
  payAgencyChargeSchema,
  type CreateAgencyChargeInput,
  type PayAgencyChargeInput,
  CHARGE_TYPES,
} from '@transitsoftservices/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, Droplet, Zap, Home, Users, Wifi, Phone, Sparkles, Shield, Wrench, FileText, Trash2, Edit2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount } from '@transitsoftservices/shared';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  WATER: 'Eau',
  ELECTRICITY: 'Electricite',
  RENT: 'Loyer',
  SALARY: 'Masse salariale',
  INTERNET: 'Internet',
  PHONE: 'Telephone',
  CLEANING: 'Entretien',
  SECURITY: 'Securite',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Autre',
};

const TYPE_ICONS: Record<string, any> = {
  WATER: Droplet,
  ELECTRICITY: Zap,
  RENT: Home,
  SALARY: Users,
  INTERNET: Wifi,
  PHONE: Phone,
  CLEANING: Sparkles,
  SECURITY: Shield,
  MAINTENANCE: Wrench,
  OTHER: FileText,
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  agencyId: string;
}

export function AgencyChargesTab({ agencyId }: Props) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [showAdd, setShowAdd] = useState(false);
  const [editCharge, setEditCharge] = useState<any | null>(null);
  const [payCharge, setPayCharge] = useState<any | null>(null);
  const [deleteCharge, setDeleteCharge] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agencies', agencyId, 'charges', period],
    queryFn: () =>
      apiClient
        .get(`/agencies/${agencyId}/charges`, { params: { period } })
        .then((r) => r.data),
    enabled: !!agencyId,
  });

  const summary = data?.data;
  const items = summary?.items || [];
  const totals = summary?.totals;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'charges'] });
  };

  const handleDelete = async () => {
    if (!deleteCharge) return;
    setBusy(true);
    try {
      await apiClient.delete(`/agencies/charges/${deleteCharge.id}`);
      toast.success('Charge supprimee');
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    }
    setBusy(false);
    setDeleteCharge(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400">Periode</p>
          <input
            type="month"
            className="mt-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <AppButton onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Ajouter une charge
        </AppButton>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AppCard>
          <p className="text-xs uppercase tracking-wider text-gray-400">Attendu (mois)</p>
          <p className="mt-1 text-2xl font-bold">{formatAmount(Number(totals?.expected ?? 0))}</p>
        </AppCard>
        <AppCard>
          <p className="text-xs uppercase tracking-wider text-gray-400">Paye</p>
          <p className="mt-1 text-2xl font-bold text-primary-700">
            {formatAmount(Number(totals?.paid ?? 0))}
          </p>
        </AppCard>
        <AppCard>
          <p className="text-xs uppercase tracking-wider text-gray-400">Restant a payer</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatAmount(Number(totals?.balance ?? 0))}
          </p>
        </AppCard>
      </div>

      {/* List */}
      <AppCard>
        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Aucune charge configuree pour cette agence.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((c: any) => {
              const Icon = TYPE_ICONS[c.type] || Wallet;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                    <Icon className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-gray-500">
                      {TYPE_LABELS[c.type] || c.type}
                      {c.dueDayOfMonth && ` - du ${c.dueDayOfMonth}`}
                      {c.reference && ` - ref ${c.reference}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Attendu</p>
                    <p className="text-sm font-bold">{formatAmount(Number(c.defaultAmount))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Paye</p>
                    <p className="text-sm font-bold text-primary-700">{formatAmount(c.paidAmount)}</p>
                  </div>
                  <div>
                    {c.status === 'PAID' && <AppBadge variant="success">Paye</AppBadge>}
                    {c.status === 'PARTIAL' && <AppBadge variant="warning">Partiel</AppBadge>}
                    {c.status === 'UNPAID' && <AppBadge variant="error">Impaye</AppBadge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <AppButton
                      size="sm"
                      variant="outline"
                      onClick={() => setPayCharge(c)}
                      disabled={c.status === 'PAID'}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      Payer
                    </AppButton>
                    <button
                      type="button"
                      className="rounded-lg p-2 hover:bg-gray-100"
                      onClick={() => setEditCharge(c)}
                      aria-label="Modifier"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 hover:bg-red-50"
                      onClick={() => setDeleteCharge(c)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppCard>

      <ChargeFormDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        agencyId={agencyId}
        onSaved={invalidate}
      />

      <ChargeFormDialog
        open={!!editCharge}
        onClose={() => setEditCharge(null)}
        agencyId={agencyId}
        charge={editCharge}
        onSaved={invalidate}
      />

      <PayChargeDialog
        open={!!payCharge}
        onClose={() => setPayCharge(null)}
        charge={payCharge}
        period={period}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleteCharge}
        onClose={() => setDeleteCharge(null)}
        onConfirm={handleDelete}
        title="Supprimer la charge"
        message={
          deleteCharge?.paidAmount > 0
            ? `Cette charge a deja des paiements. Elle sera desactivee (l'historique reste preserve).`
            : `Confirmer la suppression de "${deleteCharge?.label}" ?`
        }
        confirmLabel={deleteCharge?.paidAmount > 0 ? 'Desactiver' : 'Supprimer'}
        variant="destructive"
        loading={busy}
      />
    </div>
  );
}

// --------- Form dialog (create / edit) ---------

interface ChargeFormProps {
  open: boolean;
  onClose: () => void;
  agencyId: string;
  charge?: any;
  onSaved: () => void;
}

function ChargeFormDialog({ open, onClose, agencyId, charge, onSaved }: ChargeFormProps) {
  const isEdit = !!charge;
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateAgencyChargeInput>({
    resolver: zodResolver(createAgencyChargeSchema),
    defaultValues: charge
      ? {
          type: charge.type,
          label: charge.label,
          defaultAmount: Number(charge.defaultAmount),
          dueDayOfMonth: charge.dueDayOfMonth ?? undefined,
          reference: charge.reference ?? undefined,
        }
      : { type: 'WATER' as any },
  });

  const onSubmit = async (data: CreateAgencyChargeInput) => {
    try {
      if (isEdit) {
        await apiClient.patch(`/agencies/charges/${charge.id}`, data);
        toast.success('Charge modifiee');
      } else {
        await apiClient.post(`/agencies/${agencyId}/charges`, data);
        toast.success('Charge creee');
      }
      onSaved();
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    }
  };

  const typeOptions = CHARGE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] || t }));

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la charge' : 'Nouvelle charge recurrente'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose} type="button">
            Annuler
          </AppButton>
          <AppButton type="submit" form="charge-form" loading={isSubmitting}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <form id="charge-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <AppSelect
              label="Type de charge"
              options={typeOptions}
              value={field.value}
              onValueChange={field.onChange}
              error={errors.type?.message}
            />
          )}
        />
        <AppInput label="Libelle" {...register('label')} error={errors.label?.message} />
        <AppInput
          label="Montant par defaut"
          type="number"
          step="0.01"
          {...register('defaultAmount', { valueAsNumber: true })}
          error={errors.defaultAmount?.message}
        />
        <AppInput
          label="Jour d'echeance (1-31)"
          type="number"
          min={1}
          max={31}
          {...register('dueDayOfMonth', { valueAsNumber: true })}
          error={errors.dueDayOfMonth?.message}
        />
        <AppInput
          label="Reference (optionnelle)"
          placeholder="N compteur, contrat, ..."
          {...register('reference')}
          error={errors.reference?.message}
        />
      </form>
    </AppDialog>
  );
}

// --------- Pay dialog ---------

interface PayProps {
  open: boolean;
  onClose: () => void;
  charge: any;
  period: string;
  onSaved: () => void;
}

function PayChargeDialog({ open, onClose, charge, period, onSaved }: PayProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayAgencyChargeInput>({
    resolver: zodResolver(payAgencyChargeSchema),
    defaultValues: {
      amount: Number(charge?.balance ?? charge?.defaultAmount ?? 0),
      period,
    },
  });

  const onSubmit = async (data: PayAgencyChargeInput) => {
    try {
      await apiClient.post(`/agencies/charges/${charge.id}/pay`, data);
      toast.success('Paiement enregistre');
      onSaved();
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec du paiement');
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={charge ? `Payer : ${charge.label}` : 'Payer'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose} type="button">
            Annuler
          </AppButton>
          <AppButton type="submit" form="pay-charge-form" loading={isSubmitting}>
            Enregistrer le paiement
          </AppButton>
        </>
      }
    >
      <form id="pay-charge-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {charge && (
          <div className="rounded-xl bg-primary-50 p-3 text-sm">
            <p className="text-xs text-primary-700">{TYPE_LABELS[charge.type] || charge.type}</p>
            <p className="font-medium">{charge.label}</p>
            <p className="text-xs text-gray-600 mt-1">
              Restant : <span className="font-bold">{formatAmount(Number(charge.balance ?? 0))}</span>{' '}
              sur {formatAmount(Number(charge.defaultAmount))}
            </p>
          </div>
        )}
        <AppInput
          label="Montant"
          type="number"
          step="0.01"
          {...register('amount', { valueAsNumber: true })}
          error={errors.amount?.message}
        />
        <AppInput
          label="Periode"
          placeholder="YYYY-MM"
          {...register('period')}
          error={errors.period?.message}
        />
        <AppInput
          label="Description (optionnel)"
          {...register('description')}
          error={errors.description?.message}
        />
        <AppInput
          label="URL recu (optionnel)"
          type="url"
          placeholder="https://..."
          {...register('receiptUrl')}
          error={errors.receiptUrl?.message}
        />
      </form>
    </AppDialog>
  );
}

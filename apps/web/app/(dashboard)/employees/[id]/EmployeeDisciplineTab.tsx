'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppBadge } from '@/components/ui/AppBadge';
import { ImageInput } from '@/components/shared/ImageInput';
import { uploadImage, uploadFile } from '@/lib/api/uploads';
import { formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

const SANCTION_TYPES = [
  { value: 'WARNING', label: 'Avertissement' },
  { value: 'SUSPENSION', label: 'Mise a pied (suspension)' },
  { value: 'PAY_FREEZE', label: 'Gel de salaire' },
  { value: 'DEMOTION', label: 'Retrogradation' },
];

const TERMINATION_TYPES = [
  { value: 'RESIGNATION', label: 'Demission' },
  { value: 'DISMISSAL', label: 'Licenciement' },
  { value: 'END_OF_CONTRACT', label: 'Fin CDD / stage' },
  { value: 'MUTUAL_AGREEMENT', label: 'Rupture conventionnelle' },
  { value: 'RETIREMENT', label: 'Retraite' },
  { value: 'OTHER', label: 'Autre' },
];

export function EmployeeDisciplineTab({ employeeId, employee }: { employeeId: string; employee: any }) {
  const qc = useQueryClient();

  // Sanction form
  const [sType, setSType] = useState('WARNING');
  const [sReason, setSReason] = useState('');
  const [sFrom, setSFrom] = useState('');
  const [sTo, setSTo] = useState('');
  const [sAttachment, setSAttachment] = useState<{ url: string; key?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Termination form
  const [tType, setTType] = useState('RESIGNATION');
  const [tReason, setTReason] = useState('');
  const [tDate, setTDate] = useState('');

  const { data: sanctionsData } = useQuery({
    queryKey: ['employees', employeeId, 'sanctions'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/sanctions`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const sanctions: any[] = sanctionsData?.data ?? [];

  const handleAttachment = async (file: File) => {
    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      const up = isImage ? await uploadImage(file) : await uploadFile(file);
      setSAttachment({ url: up.url, key: up.key });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec upload');
    } finally {
      setUploading(false);
    }
  };

  const sanctionMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/sanctions`, {
        type: sType,
        reason: sReason,
        effectiveFrom: sFrom,
        effectiveTo: sTo || undefined,
        attachmentUrl: sAttachment?.url,
        attachmentKey: sAttachment?.key,
      }),
    onSuccess: () => {
      toast.success('Sanction enregistree');
      setSReason('');
      setSFrom('');
      setSTo('');
      setSAttachment(null);
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'sanctions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const terminationMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/terminate`, {
        type: tType,
        reason: tReason,
        effectiveDate: tDate,
      }),
    onSuccess: () => {
      toast.success('Rupture de contrat enregistree');
      qc.invalidateQueries({ queryKey: ['employees', employeeId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Nouvelle sanction</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AppSelect label="Type" options={SANCTION_TYPES} value={sType} onValueChange={setSType} />
          <AppInput label="Motif" value={sReason} onChange={(e) => setSReason(e.target.value)} />
          <AppInput label="Effet du" type="date" value={sFrom} onChange={(e) => setSFrom(e.target.value)} />
          <AppInput label="Au (optionnel)" type="date" value={sTo} onChange={(e) => setSTo(e.target.value)} />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-gray-500">Document joint (optionnel)</p>
          <ImageInput
            value={sAttachment?.url ?? null}
            onFile={handleAttachment}
            uploading={uploading}
            allowClear={!!sAttachment}
            onClear={() => setSAttachment(null)}
            height={120}
            hint="Photographiez ou uploadez le PV / courrier"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <AppButton
            onClick={() => sanctionMutation.mutate()}
            loading={sanctionMutation.isPending}
            disabled={!sReason.trim() || !sFrom}
          >
            Enregistrer
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Historique des sanctions</h3>
        {sanctions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune sanction enregistree.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sanctions.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <AppBadge variant={s.type === 'WARNING' ? 'warning' : 'error'}>{s.type}</AppBadge>
                  <span className="text-xs text-gray-500">{formatDate(s.effectiveFrom)}</span>
                  {s.effectiveTo && (
                    <span className="text-xs text-gray-500">→ {formatDate(s.effectiveTo)}</span>
                  )}
                </div>
                <p className="mt-1 text-gray-700">{s.reason}</p>
                {s.decidedBy && (
                  <p className="text-xs text-gray-400">
                    Decide par {s.decidedBy.firstName} {s.decidedBy.lastName}
                  </p>
                )}
                {s.attachmentUrl && (
                  <a href={s.attachmentUrl} className="text-xs text-primary-700 hover:underline" target="_blank" rel="noreferrer">
                    Voir piece jointe
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {employee?.isActive && (
        <AppCard>
          <h3 className="mb-3 text-base font-semibold text-red-700">Rupture de contrat</h3>
          <p className="mb-3 text-xs text-gray-500">
            Action irreversible : l&apos;employe sera marque inactif et la date de fin sera enregistree.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AppSelect label="Type" options={TERMINATION_TYPES} value={tType} onValueChange={setTType} />
            <AppInput label="Date d'effet" type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} />
            <AppInput label="Motif" value={tReason} onChange={(e) => setTReason(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end">
            <AppButton
              variant="outline"
              onClick={() => {
                if (!confirm('Confirmer la rupture du contrat ? L\'employe sera desactive.')) return;
                terminationMutation.mutate();
              }}
              loading={terminationMutation.isPending}
              disabled={!tDate || !tReason.trim()}
            >
              Rompre le contrat
            </AppButton>
          </div>
        </AppCard>
      )}
    </div>
  );
}

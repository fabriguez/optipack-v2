'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

export function EmployeeReviewsTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState('');
  const [score, setScore] = useState('');
  const [summary, setSummary] = useState('');

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'reviews'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/reviews`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: any[] = data?.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/reviews`, {
        period,
        score: score ? Number(score) : undefined,
        summary: summary || undefined,
      }),
    onSuccess: () => {
      toast.success('Evaluation enregistree');
      setPeriod('');
      setScore('');
      setSummary('');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'reviews'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Nouvelle evaluation</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AppInput label="Periode" placeholder="Q1-2026, 2026-04..." value={period} onChange={(e) => setPeriod(e.target.value)} />
          <AppInput label="Note (optionnelle)" type="number" step="0.1" value={score} onChange={(e) => setScore(e.target.value)} />
          <AppInput label="Synthese" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="mt-3 flex justify-end">
          <AppButton onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!period.trim()}>
            Enregistrer
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Historique</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune evaluation.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.period}</span>
                  {r.score != null && (
                    <span className="font-mono text-xs text-primary-700">{Number(r.score)}</span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(r.createdAt)}</span>
                </div>
                {r.summary && <p className="mt-1 text-gray-700">{r.summary}</p>}
                {r.reviewer && (
                  <p className="text-xs text-gray-400">
                    Evalue par {r.reviewer.firstName} {r.reviewer.lastName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}

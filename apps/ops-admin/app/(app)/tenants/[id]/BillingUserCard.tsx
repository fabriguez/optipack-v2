'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface BillingUserInfo {
  exists: boolean;
  user: { id: string; email: string; isActive: boolean; lastLoginAt: string | null; createdAt: string } | null;
}

export function BillingUserCard({ tenantId, ownerEmail }: { tenantId: string; ownerEmail: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const info = useQuery<BillingUserInfo>({
    queryKey: ['tenant-billing-user', tenantId],
    queryFn: async () => (await api.get(`/tenants/${tenantId}/billing-user`)).data?.data,
  });

  const reset = useMutation({
    mutationFn: async () => {
      const body = email.trim() ? { email: email.trim() } : {};
      return (await api.post(`/tenants/${tenantId}/billing-user`, body)).data?.data as {
        email: string;
        password: string;
        created: boolean;
      };
    },
    onSuccess: (data) => {
      setCreds({ email: data.email, password: data.password });
      setEmail('');
      qc.invalidateQueries({ queryKey: ['tenant-billing-user', tenantId] });
    },
  });

  const u = info.data?.user;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-gray-500">
        Compte permettant au client de se connecter a l&apos;ops-admin pour consulter son tenant
        et regler ses factures (Mobile Money). Acces restreint : aucune action d&apos;infrastructure.
      </p>

      {info.isLoading ? (
        <p className="text-xs text-gray-400">Chargement...</p>
      ) : u ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Cell label="Email">{u.email}</Cell>
          <Cell label="Actif">{u.isActive ? 'Oui' : 'Non'}</Cell>
          <Cell label="Dernier login">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Jamais'}</Cell>
        </div>
      ) : (
        <p className="text-xs text-amber-600">Aucun compte facturation pour ce tenant.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs flex-1 min-w-[200px]">
          <span className="block text-gray-500">Email (defaut : {ownerEmail})</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ownerEmail}
            className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
          className="rounded-md bg-primary-700 px-3 py-1.5 text-sm text-white hover:bg-primary-900 disabled:opacity-50"
        >
          {reset.isPending ? '...' : u ? 'Regenerer le mot de passe' : 'Creer le compte'}
        </button>
      </div>

      {reset.isError && (
        <p className="text-xs text-red-600">
          {(reset.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur'}
        </p>
      )}

      {creds && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="font-semibold text-emerald-800">Identifiants (notez-les, non recuperables) :</p>
          <p className="mt-1 font-mono">Email : {creds.email}</p>
          <p className="font-mono">Mot de passe : {creds.password}</p>
        </div>
      )}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

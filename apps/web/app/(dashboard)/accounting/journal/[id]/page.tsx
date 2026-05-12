'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User as UserIcon, ExternalLink } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { accountingApi } from '@/lib/api/finance';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';

const SOURCE_LABELS: Record<string, string> = {
  PAYMENT: 'Paiement',
  DISBURSEMENT: 'Decaissement',
  TRANSFER: 'Transfert',
  EXPENSE: 'Depense',
  PENALTY: 'Penalite',
  SALARY: 'Salaire',
};

/**
 * Mappe sourceType + sourceId vers l'URL de la source liee. Toutes les routes
 * pointent vers la page detail du module concerne (ex: /payments/:id).
 */
function sourceUrl(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  switch (sourceType) {
    case 'PAYMENT':
      return `/payments/${sourceId}`;
    case 'DISBURSEMENT':
      return `/disbursements/${sourceId}`;
    case 'TRANSFER':
      return `/fund-transfers/${sourceId}`;
    case 'EXPENSE':
      return `/expenses/${sourceId}`;
    case 'PENALTY':
      return `/penalties/${sourceId}`;
    case 'SALARY':
      return `/employees`;
    default:
      return null;
  }
}

export default function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ['accounting', 'entry', id],
    queryFn: () => accountingApi.getEntry(id),
  });

  if (isLoading) {
    return (
      <PageTransition>
        <p className="text-sm text-gray-500">Chargement de l&apos;ecriture...</p>
      </PageTransition>
    );
  }

  if (error || !data?.data) {
    return (
      <PageTransition>
        <p className="text-sm text-red-600">Ecriture introuvable.</p>
        <Link
          href="/accounting"
          className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" /> Retour au grand livre
        </Link>
      </PageTransition>
    );
  }

  const entry = data.data;
  const linkedUrl = sourceUrl(entry.sourceType, entry.sourceId);
  const totalDebit = (entry.lines ?? []).reduce(
    (s: number, l: { debitAmount?: number | string }) => s + Number(l.debitAmount || 0),
    0,
  );
  const totalCredit = (entry.lines ?? []).reduce(
    (s: number, l: { creditAmount?: number | string }) => s + Number(l.creditAmount || 0),
    0,
  );

  return (
    <PageTransition>
      <div className="space-y-4">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" /> Retour au grand livre
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-gray-500">{entry.reference}</p>
            <h1 className="text-2xl font-bold text-gray-900">{entry.description}</h1>
            <p className="mt-1 text-sm text-gray-500">{formatDateTime(entry.date)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge variant="info">{SOURCE_LABELS[entry.sourceType] || entry.sourceType}</AppBadge>
            {linkedUrl && entry.sourceId && (
              <Link
                href={linkedUrl}
                className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                <ExternalLink className="h-3 w-3" /> Voir la source
              </Link>
            )}
          </div>
        </div>

        <AppCard padding="md">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Info label="Reference">{entry.reference}</Info>
            <Info label="Date">{formatDateTime(entry.date)}</Info>
            <Info label="Source" copyable>
              {entry.sourceType}
              {entry.sourceId ? ` / ${entry.sourceId.slice(0, 8)}...` : ''}
            </Info>
            <Info label="Total debit">
              <span className="font-semibold text-primary-700">{formatAmount(totalDebit)}</span>
            </Info>
            <Info label="Total credit">
              <span className="font-semibold text-red-600">{formatAmount(totalCredit)}</span>
            </Info>
            <Info label="Equilibre">
              {totalDebit === totalCredit ? (
                <AppBadge variant="success">Oui</AppBadge>
              ) : (
                <AppBadge variant="error">Non ({formatAmount(totalDebit - totalCredit)})</AppBadge>
              )}
            </Info>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm">
            <UserIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Cree par :</span>
            <span className="font-medium">
              {entry.createdBy?.fullName ?? 'systeme'}
            </span>
            {entry.createdBy?.email && (
              <span className="text-xs text-gray-400">({entry.createdBy.email})</span>
            )}
          </div>
        </AppCard>

        <AppCard padding="md">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Lignes d&apos;ecriture</h2>
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left font-normal">Compte debit</th>
                <th className="px-2 py-2 text-left font-normal">Compte credit</th>
                <th className="px-2 py-2 text-right font-normal">Debit</th>
                <th className="px-2 py-2 text-right font-normal">Credit</th>
                <th className="px-2 py-2 text-left font-normal">Libelle</th>
              </tr>
            </thead>
            <tbody>
              {(entry.lines ?? []).map(
                (l: {
                  id: string;
                  debitAccount?: { code: string; name: string };
                  creditAccount?: { code: string; name: string };
                  debitAmount?: number | string;
                  creditAmount?: number | string;
                  description?: string;
                }) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-2">
                      {l.debitAccount ? (
                        <span>
                          <span className="font-mono text-xs text-gray-500">
                            {l.debitAccount.code}
                          </span>{' '}
                          {l.debitAccount.name}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {l.creditAccount ? (
                        <span>
                          <span className="font-mono text-xs text-gray-500">
                            {l.creditAccount.code}
                          </span>{' '}
                          {l.creditAccount.name}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {Number(l.debitAmount) > 0 ? formatAmount(Number(l.debitAmount)) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {Number(l.creditAmount) > 0 ? formatAmount(Number(l.creditAmount)) : '-'}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">{l.description ?? ''}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </AppCard>

        {entry.reverseReason && (
          <AppCard padding="md">
            <h2 className="mb-2 text-sm font-semibold text-red-700">
              Reconciliation / Reversal
            </h2>
            <p className="text-xs text-gray-700 whitespace-pre-line">{entry.reverseReason}</p>
          </AppCard>
        )}
      </div>
    </PageTransition>
  );
}

function Info({
  label,
  children,
  copyable,
}: {
  label: string;
  children: React.ReactNode;
  copyable?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <div className={'mt-0.5 ' + (copyable ? 'font-mono text-xs' : '')}>{children}</div>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { fetchPdfAuthed } from '@/lib/api/pdfDownload';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { FileText, Download } from 'lucide-react';
import { formatAmount, formatDate } from '@transitsoftservices/shared';

interface Payslip {
  id: string;
  period: string;
  baseSalary: string | number;
  grossSalary: string | number;
  netSalary: string | number;
  paidAmount: string | number;
  isPaid: boolean;
  paidAt: string | null;
  generatedAt: string;
  deductionsTotal: string | number | null;
  paymentNote: string | null;
  payments?: Array<{ id: string; amount: string | number; paidAt: string; note: string | null }>;
}

/**
 * Historique des bulletins de paie d'un employe.
 * Chaque paiement (ou paiement partiel) genere/met a jour un Payslip ;
 * on les liste ici avec le statut paye/partiel et le PDF telechargeable.
 */
export function EmployeePayslipsTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employees', employeeId, 'payslips'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/payslips`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: Payslip[] = data?.data ?? [];

  const download = (p: Payslip, mode: 'open' | 'download') =>
    fetchPdfAuthed(`/employees/payslips/${p.id}/pdf`, {
      mode,
      fileName: `bulletin-${p.period}-${employeeName.replace(/\s+/g, '_')}.pdf`,
    });

  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Bulletins de paie</h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Aucun bulletin emis. Un bulletin est cree automatiquement au premier versement de salaire pour une periode.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2">Periode</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2 text-right">Brut</th>
              <th className="pb-2 text-right">Net</th>
              <th className="pb-2 text-right">Verse</th>
              <th className="pb-2 text-right">Reste</th>
              <th className="pb-2">Versements</th>
              <th className="pb-2 text-right">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((p) => {
              const net = Number(p.netSalary);
              const paid = Number(p.paidAmount ?? 0);
              const remaining = Math.max(0, net - paid);
              const partial = paid > 0 && remaining > 0;
              return (
                <tr key={p.id}>
                  <td className="py-2 font-medium">{p.period}</td>
                  <td className="py-2">
                    {p.isPaid ? (
                      <AppBadge variant="success">Soldé {p.paidAt ? formatDate(p.paidAt) : ''}</AppBadge>
                    ) : partial ? (
                      <AppBadge variant="warning">Partiel</AppBadge>
                    ) : (
                      <AppBadge variant="default">Emis</AppBadge>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">{formatAmount(Number(p.grossSalary))}</td>
                  <td className="py-2 text-right font-mono">{formatAmount(net)}</td>
                  <td className="py-2 text-right font-mono text-green-700">{formatAmount(paid)}</td>
                  <td className="py-2 text-right font-mono text-red-700">{remaining > 0 ? formatAmount(remaining) : '-'}</td>
                  <td className="py-2 text-xs text-gray-500">{p.payments?.length ?? 0} versement(s)</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <AppButton size="sm" variant="outline" onClick={() => download(p, 'open')} title="Ouvrir le bulletin">
                        <FileText className="h-4 w-4" />
                      </AppButton>
                      <AppButton size="sm" variant="outline" onClick={() => download(p, 'download')} title="Telecharger">
                        <Download className="h-4 w-4" />
                      </AppButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </AppCard>
  );
}

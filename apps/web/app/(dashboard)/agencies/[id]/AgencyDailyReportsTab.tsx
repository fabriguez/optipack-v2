'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { ImageInput } from '@/components/shared/ImageInput';
import { uploadImage, uploadFile } from '@/lib/api/uploads';
import { resolveImageUrl } from '@/lib/api/imageUrl';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { ChevronDown, ChevronRight, FileText, Lock, Paperclip, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface DailyReport {
  id: string;
  agencyId: string;
  date: string;
  payload: any;
  status: 'GENERATED' | 'CLOSED' | 'AMENDED';
  observation: string | null;
  generatedAt: string;
  closedAt: string | null;
  attachments?: Attachment[];
  _count?: { attachments: number };
}

interface Attachment {
  id: string;
  url: string;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  caption: string | null;
  createdAt: string;
}

interface Props {
  agencyId: string;
}

export function AgencyDailyReportsTab({ agencyId }: Props) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agencies', agencyId, 'daily-reports'],
    queryFn: () => apiClient.get(`/agencies/${agencyId}/daily-reports`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/agencies/${agencyId}/daily-reports`, {}).then((r) => r.data),
    onSuccess: () => {
      toast.success('Rapport genere');
      qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'daily-reports'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec de la generation'),
  });

  const reports = (data?.data as DailyReport[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Les rapports sont generes automatiquement a la fermeture de la caisse. Vous
          pouvez aussi en generer un manuellement pour la journee en cours.
        </p>
        <AppButton size="sm" onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
          <RefreshCw className="h-3.5 w-3.5" />
          Generer aujourd&apos;hui
        </AppButton>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : reports.length === 0 ? (
        <AppCard>
          <p className="text-sm text-gray-400 text-center py-6">Aucun rapport pour le moment.</p>
        </AppCard>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              expanded={expandedId === report.id}
              onToggle={() => setExpandedId((x) => (x === report.id ? null : report.id))}
              onChange={() => qc.invalidateQueries({ queryKey: ['agencies', agencyId, 'daily-reports'] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report,
  expanded,
  onToggle,
  onChange,
}: {
  report: DailyReport;
  expanded: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const date = new Date(report.date);
  const payload = report.payload || {};

  return (
    <AppCard>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <FileText className="h-4 w-4 text-primary-600" />
          <div>
            <p className="text-sm font-medium">Rapport du {formatDate(date)}</p>
            <p className="text-xs text-gray-500">
              {payload.totalParcels ?? 0} colis recus &middot; reste a payer {formatAmount(payload.totalRemainingAmount ?? 0)}
              {report._count?.attachments ? ` · ${report._count.attachments} piece(s) jointe(s)` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppBadge variant={report.status === 'CLOSED' ? 'success' : report.status === 'AMENDED' ? 'warning' : 'default'}>
            {report.status === 'CLOSED' ? 'Cloture' : report.status === 'AMENDED' ? 'Annote' : 'Genere'}
          </AppBadge>
        </div>
      </button>

      {expanded && <ReportDetails reportId={report.id} initialReport={report} onChange={onChange} />}
    </AppCard>
  );
}

function ReportDetails({
  reportId,
  initialReport,
  onChange,
}: {
  reportId: string;
  initialReport: DailyReport;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [observation, setObservation] = useState(initialReport.observation ?? '');
  const [savingObs, setSavingObs] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['daily-reports', reportId],
    queryFn: () => apiClient.get(`/agencies/daily-reports/${reportId}`).then((r) => r.data),
  });

  const report = (data?.data as DailyReport) ?? initialReport;
  const payload = report.payload || {};

  const saveObservation = async (status?: 'CLOSED' | 'AMENDED') => {
    setSavingObs(true);
    try {
      await apiClient.patch(`/agencies/daily-reports/${reportId}`, { observation, status });
      toast.success(status === 'CLOSED' ? 'Rapport cloture' : 'Observation enregistree');
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec de la sauvegarde');
    } finally {
      setSavingObs(false);
    }
  };

  const handleAttachment = async (file: File) => {
    setUploading(true);
    try {
      // Image -> /uploads/image (gere webp/etc) ; sinon -> /uploads/file (PDF/XLSX/Word/...)
      const isImage = file.type.startsWith('image/');
      const uploaded = isImage ? await uploadImage(file) : await uploadFile(file);
      await apiClient.post(`/agencies/daily-reports/${reportId}/attachments`, {
        url: uploaded.url,
        storageKey: uploaded.key,
        fileName: file.name,
        contentType: uploaded.contentType,
        size: uploaded.size,
      });
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      onChange();
      toast.success('Piece jointe ajoutee');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (attId: string) => {
    try {
      await apiClient.delete(`/agencies/daily-reports/${reportId}/attachments/${attId}`);
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      toast.success('Piece supprimee');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
      {/* Synthese chiffres */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Colis recus" value={String(payload.totalParcels ?? 0)} />
        <Stat label="Reste a payer" value={formatAmount(payload.totalRemainingAmount ?? 0)} />
        <Stat label="Paiements" value={'+' + formatAmount(payload.paymentsTotal ?? 0)} positive />
        <Stat label="Decaissements" value={'-' + formatAmount(payload.disbursementsTotal ?? 0)} negative />
      </div>

      {/* Par categorie */}
      {payload.byCategory && Object.keys(payload.byCategory).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Par categorie</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-50">
              {Object.entries(payload.byCategory as Record<string, { count: number; totalRemaining: number }>).map(([cat, v]) => (
                <tr key={cat}>
                  <td className="py-1.5">{cat}</td>
                  <td className="py-1.5 text-right font-medium">{v.count}</td>
                  <td className="py-1.5 text-right text-primary-700">{formatAmount(v.totalRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Par route de transit */}
      {payload.byTransitRoute && Object.keys(payload.byTransitRoute).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Par route de transit</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-50">
              {Object.values(payload.byTransitRoute as Record<string, any>).map((r: any) => (
                <tr key={r.routeId ?? r.routeName}>
                  <td className="py-1.5">{r.routeName} {r.type ? `(${r.type})` : ''}</td>
                  <td className="py-1.5 text-right font-medium">{r.count}</td>
                  <td className="py-1.5 text-right text-primary-700">{formatAmount(r.totalRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Observation */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">Observation</p>
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          placeholder="Ajoutez vos commentaires ou notes pour ce rapport..."
        />
        <div className="mt-2 flex items-center gap-2">
          <AppButton size="sm" onClick={() => saveObservation('AMENDED')} loading={savingObs}>
            <Save className="h-3.5 w-3.5" />
            Enregistrer
          </AppButton>
          {report.status !== 'CLOSED' && (
            <AppButton size="sm" variant="outline" onClick={() => saveObservation('CLOSED')} loading={savingObs}>
              <Lock className="h-3.5 w-3.5" />
              Cloturer
            </AppButton>
          )}
        </div>
      </div>

      {/* Pieces jointes */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
          <Paperclip className="h-3.5 w-3.5" /> Pieces jointes
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ImageInput
            value={null}
            onFile={handleAttachment}
            uploading={uploading}
            allowClear={false}
            height={120}
            hint="Glissez ou photographiez une piece justificative (image)"
          />
          <NonImageAttachmentInput onUpload={handleAttachment} uploading={uploading} />
        </div>

        {report.attachments && report.attachments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {report.attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                <a href={resolveImageUrl(att.url) ?? att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary-700 hover:underline truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{att.fileName ?? 'piece-jointe'}</span>
                  {att.contentType && <span className="text-gray-400">({att.contentType})</span>}
                </a>
                <button
                  type="button"
                  onClick={() => deleteAttachment(att.id)}
                  className="rounded-lg p-1 text-red-500 hover:bg-red-50"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function NonImageAttachmentInput({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
  return (
    <label className="flex h-30 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50/40">
      <Paperclip className="mb-2 h-5 w-5 text-gray-400" />
      <span>Ajouter PDF / XLSX / Word / autre</span>
      {uploading && <span className="mt-1 text-primary-600">Upload en cours...</span>}
      <input
        type="file"
        accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

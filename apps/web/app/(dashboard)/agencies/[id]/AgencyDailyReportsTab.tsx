'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { ImageInput } from '@/components/shared/ImageInput';
import { uploadImage, uploadFile } from '@/lib/api/uploads';
import { openAuthedFile } from '@/components/shared/AuthedImage';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { ChevronDown, ChevronRight, FileText, Lock, Mail, Paperclip, Printer, RefreshCw, Save, Trash2 } from 'lucide-react';
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
  emailedAt?: string | null;
  emailSentTo?: Array<{ email: string; name: string; role: string; sentAt: string; ok: boolean; error?: string }> | null;
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
              agencyId={agencyId}
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
  agencyId,
  expanded,
  onToggle,
  onChange,
}: {
  report: DailyReport;
  agencyId: string;
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

      {expanded && <ReportDetails reportId={report.id} agencyId={agencyId} initialReport={report} onChange={onChange} />}
    </AppCard>
  );
}

function ReportDetails({
  reportId,
  agencyId,
  initialReport,
  onChange,
}: {
  reportId: string;
  agencyId: string;
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

  const [pendingCaption, setPendingCaption] = useState('');

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
        caption: pendingCaption.trim() || null,
      });
      setPendingCaption('');
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      onChange();
      toast.success('Piece jointe ajoutee');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const updateCaption = async (attId: string, caption: string) => {
    try {
      await apiClient.patch(`/agencies/daily-reports/${reportId}/attachments/${attId}`, { caption });
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      toast.success('Libelle mis a jour');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec mise a jour libelle');
    }
  };

  const [regenerating, setRegenerating] = useState(false);
  const regenerate = async () => {
    setRegenerating(true);
    try {
      await apiClient.post(`/agencies/${agencyId}/daily-reports`, { date: initialReport.date });
      toast.success('Rapport regenere');
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec de la regeneration');
    } finally {
      setRegenerating(false);
    }
  };

  const [sendingMail, setSendingMail] = useState(false);
  const resendMail = async () => {
    setSendingMail(true);
    try {
      const res = await apiClient.post(`/agencies/daily-reports/${reportId}/email`);
      const data = res.data?.data;
      const sent = data?.sent ?? 0;
      const total = data?.recipients?.length ?? 0;
      if (sent > 0) toast.success(`Mail envoye a ${sent} destinataire(s) sur ${total}`);
      else toast.error(total === 0 ? 'Aucun destinataire trouve' : 'Echec envoi mail (voir logs)');
      qc.invalidateQueries({ queryKey: ['daily-reports', reportId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec envoi mail');
    } finally {
      setSendingMail(false);
    }
  };

  const printPDF = async () => {
    try {
      const res = await apiClient.get(`/agencies/daily-reports/${reportId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Echec du telechargement PDF');
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
      {/* Boutons actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {report.emailedAt && (
          <span className="text-xs text-gray-500">
            Dernier envoi mail : {new Date(report.emailedAt).toLocaleString('fr-FR')}
          </span>
        )}
        <AppButton size="sm" variant="outline" onClick={regenerate} loading={regenerating}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerer
        </AppButton>
        <AppButton size="sm" variant="outline" onClick={resendMail} loading={sendingMail}>
          <Mail className="h-3.5 w-3.5" />
          {report.emailedAt ? 'Renvoyer par mail' : 'Envoyer par mail'}
        </AppButton>
        <AppButton size="sm" variant="outline" onClick={printPDF}>
          <Printer className="h-3.5 w-3.5" />
          Imprimer en PDF
        </AppButton>
      </div>

      {/* Synthese chiffres */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Recettes" value={'+' + formatAmount(payload.recetteTotal ?? 0)} positive />
        <Stat label="Paiements en avance" value={'+' + formatAmount(payload.advancesTotal ?? 0)} />
        <Stat label="Depenses" value={'-' + formatAmount(payload.expensesTotal ?? 0)} negative />
        <Stat
          label="Solde caisse"
          value={formatAmount(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0)}
          positive={Number(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0) >= 0}
          negative={Number(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0) < 0}
        />
      </div>

      {/* Entrees par mode transit + methode */}
      {payload.entriesByTransitMethod && Object.keys(payload.entriesByTransitMethod).length > 0 && (
        <Section title="Entrees du jour par mode de transit et de paiement">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr><th className="py-1">Mode transit</th><th className="py-1">Methodes</th><th className="py-1 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Object.values(payload.entriesByTransitMethod as Record<string, any>).map((e: any) => (
                <tr key={e.type}>
                  <td className="py-1.5">{e.type}</td>
                  <td className="py-1.5 text-gray-600">{Object.entries(e.methods as Record<string, number>).map(([m, v]) => `${m}: ${formatAmount(v)}`).join(' / ')}</td>
                  <td className="py-1.5 text-right font-medium text-primary-700">{formatAmount(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Recettes vs Paiements en avance */}
      <PaymentBreakdown title="Recettes (paiements sur colis arrives a destination)" data={payload.recetteByRouteAndMethod} total={payload.recetteTotal} positive />
      <PaymentBreakdown title="Paiements en avance (colis pas encore arrives a destination)" data={payload.advancesByRouteAndMethod} total={payload.advancesTotal} />

      {/* Masse / volume colis enregistres */}
      <RouteMassVolume
        title="Flux du jour - Entrees (colis enregistres / receptionnes)"
        data={payload.flow?.in?.byRoute ?? payload.registeredByRoute}
        totalWeight={payload.flow?.in?.totalWeight}
        totalVolume={payload.flow?.in?.totalVolume}
      />
      <RouteMassVolume
        title="Flux du jour - Sorties (colis ayant quitte l'agence)"
        data={payload.flow?.out?.byRoute}
        totalWeight={payload.flow?.out?.totalWeight}
        totalVolume={payload.flow?.out?.totalVolume}
      />
      {/* Ventilation des sorties : remises client vs departs en transit */}
      {payload.flow?.out?.byType && (
        <>
          <RouteMassVolume
            title="Sorties - Remis aux clients"
            data={payload.flow.out.byType.handedOver?.byRoute}
            totalWeight={payload.flow.out.byType.handedOver?.totalWeight}
            totalVolume={payload.flow.out.byType.handedOver?.totalVolume}
          />
          <RouteMassVolume
            title="Sorties - Partis en transit (charges en conteneur)"
            data={payload.flow.out.byType.toTransit?.byRoute}
            totalWeight={payload.flow.out.byType.toTransit?.totalWeight}
            totalVolume={payload.flow.out.byType.toTransit?.totalVolume}
          />
        </>
      )}

      {/* Conteneurs recus / envoyes */}
      <ContainerList title="Conteneurs recus du jour" containers={payload.receivedContainers} dateLabel="Arrive le" dateField="arrivalDate" manifestVariant="received" />
      <ContainerList title="Conteneurs envoyes du jour" containers={payload.sentContainers} dateLabel="Parti le" dateField="departureDate" manifestVariant="sent" />

      {/* Mouvements stock */}
      <RouteMassVolume title="Entrees en stock par route" data={payload.stockIn?.byRoute} totalWeight={payload.stockIn?.totalWeight} totalVolume={payload.stockIn?.totalVolume} />
      <RouteMassVolume title="Sorties de stock par route" data={payload.stockOut?.byRoute} totalWeight={payload.stockOut?.totalWeight} totalVolume={payload.stockOut?.totalVolume} />
      <RouteMassVolume
        title={`Etat de stock actuel - valeur totale ${formatAmount(payload.stockState?.totalValue ?? 0)}`}
        data={payload.stockState?.byRoute}
        totalWeight={payload.stockState?.totalWeight}
        totalVolume={payload.stockState?.totalVolume}
      />

      {/* Transferts de fonds */}
      <FundTransfersSection
        outgoing={payload.fundTransfersOut}
        incoming={payload.fundTransfersIn}
        outTotal={payload.fundTransfersOutTotal}
        inTotal={payload.fundTransfersInTotal}
      />

      {/* Inventaires */}
      {Array.isArray(payload.inventories) && payload.inventories.length > 0 && (
        <Section title="Inventaire(s) du jour">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr><th>Magasin</th><th>Statut</th><th className="text-right">Attendus</th><th className="text-right">Scannes</th><th className="text-right">Manquants</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(payload.inventories as any[]).map((i) => (
                <tr key={i.id}>
                  <td className="py-1.5">{i.warehouse}</td>
                  <td className="py-1.5">{i.status}</td>
                  <td className="py-1.5 text-right">{i.expected}</td>
                  <td className="py-1.5 text-right">{i.scanned}</td>
                  <td className="py-1.5 text-right text-red-600">{i.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Solde caisse */}
      {payload.cashRegister && (
        <Section title="Solde caisse">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <KV label="Ouverture" value={formatAmount(payload.cashRegister.openingBalance ?? 0)} />
            <KV label="Entrees" value={'+' + formatAmount(payload.cashRegister.totalEntries ?? 0)} positive />
            <KV label="Sorties" value={'-' + formatAmount(payload.cashRegister.totalExits ?? 0)} negative />
            <KV label="Solde courant" value={formatAmount(payload.cashRegister.currentBalance ?? 0)} bold />
            {payload.cashRegister.closingBalance != null && <KV label="Solde cloture" value={formatAmount(payload.cashRegister.closingBalance)} bold />}
            {payload.cashRegister.closedAt && <KV label="Cloturee le" value={new Date(payload.cashRegister.closedAt).toLocaleString('fr-FR')} />}
          </div>
        </Section>
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
        <input
          type="text"
          value={pendingCaption}
          onChange={(e) => setPendingCaption(e.target.value)}
          placeholder="Libelle de la prochaine piece jointe (ex: Recu MTN du 12/05)"
          className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-primary-500 focus:outline-none"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ImageInput
            value={null}
            onFile={handleAttachment}
            uploading={uploading}
            allowClear={false}
            height={250}
            hint="Glissez ou photographiez une piece justificative (image)"
          />
          <NonImageAttachmentInput onUpload={handleAttachment} uploading={uploading} />
        </div>

        {report.attachments && report.attachments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {report.attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                att={att}
                onOpen={() => openAuthedFile(att.url, att.fileName ?? 'piece-jointe').catch(() => toast.error('Echec du telechargement'))}
                onSaveCaption={(c) => updateCaption(att.id, c)}
                onDelete={() => deleteAttachment(att.id)}
              />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-100 bg-white p-3">{children}</div>
    </div>
  );
}

function KV({ label, value, positive, negative, bold }: { label: string; value: string; positive?: boolean; negative?: boolean; bold?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm ${bold ? 'font-bold' : 'font-medium'} ${positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function PaymentBreakdown({ title, data, total, positive }: { title: string; data: Record<string, any> | undefined; total: number | undefined; positive?: boolean }) {
  const rows = Object.values(data ?? {});
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr><th className="py-1">Route</th><th className="py-1">Methodes</th><th className="py-1 text-right">Total</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r: any) => (
            <tr key={r.routeId ?? r.routeName}>
              <td className="py-1.5">{r.routeName} {r.type ? `(${r.type})` : ''}</td>
              <td className="py-1.5 text-gray-600">{Object.entries(r.methods as Record<string, number>).map(([m, v]) => `${m}: ${formatAmount(v)}`).join(' / ')}</td>
              <td className={`py-1.5 text-right font-medium ${positive ? 'text-green-600' : 'text-primary-700'}`}>{formatAmount(r.total)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} className="pt-2 text-right text-xs font-semibold text-gray-600">Total</td>
            <td className={`pt-2 text-right text-sm font-bold ${positive ? 'text-green-600' : 'text-primary-700'}`}>{formatAmount(total ?? 0)}</td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function RouteMassVolume({ title, data, totalWeight, totalVolume }: { title: string; data: Record<string, any> | undefined; totalWeight?: number; totalVolume?: number }) {
  const rows = Object.values(data ?? {});
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr><th className="py-1">Route</th><th className="py-1 text-right">Colis</th><th className="py-1 text-right">Masse</th><th className="py-1 text-right">Volume</th>{rows[0] && 'totalPrice' in (rows[0] as any) && <th className="py-1 text-right">Valeur</th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r: any) => (
            <tr key={r.routeId ?? r.routeName}>
              <td className="py-1.5">{r.routeName} {r.type ? `(${r.type})` : ''}</td>
              <td className="py-1.5 text-right">{r.count}</td>
              <td className="py-1.5 text-right">{Number(r.totalWeight ?? 0).toFixed(2)} kg</td>
              <td className="py-1.5 text-right">{Number(r.totalVolume ?? 0).toFixed(3)} m3</td>
              {'totalPrice' in r && <td className="py-1.5 text-right text-primary-700">{formatAmount(r.totalPrice ?? 0)}</td>}
            </tr>
          ))}
          {(totalWeight != null || totalVolume != null) && (
            <tr>
              <td colSpan={2} className="pt-2 text-right text-xs font-semibold text-gray-600">Total</td>
              <td className="pt-2 text-right text-sm font-bold">{Number(totalWeight ?? 0).toFixed(2)} kg</td>
              <td className="pt-2 text-right text-sm font-bold">{Number(totalVolume ?? 0).toFixed(3)} m3</td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function ContainerList({ title, containers, dateLabel, dateField, manifestVariant }: { title: string; containers: any[] | undefined; dateLabel: string; dateField: string; manifestVariant: 'sent' | 'received' }) {
  if (!containers || containers.length === 0) return null;

  const openManifestPDF = async (path: string, filename: string) => {
    try {
      const res = await apiClient.get(path, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Echec du telechargement du bordereau');
    }
  };

  return (
    <Section title={title}>
      <div className="space-y-3">
        {containers.map((c: any) => {
          const manifests = (c.manifests ?? []) as Array<{ id: string; number: string; type: 'DISPATCH' | 'RECEPTION' }>;
          const hasComparison = manifestVariant === 'received' && c.hasComparison;
          return (
            <div key={c.id} className="rounded-lg bg-gray-50 p-2">
              <p className="text-xs font-semibold text-gray-800">
                {c.designation} <span className="text-gray-500">- {c.type} - {c.routeName}</span>
              </p>
              <p className="text-[11px] text-gray-500">{dateLabel} {c[dateField] ? new Date(c[dateField]).toLocaleString('fr-FR') : '-'} - {c.parcels} colis - {Number(c.totalWeight ?? 0).toFixed(2)} kg - {Number(c.totalVolume ?? 0).toFixed(3)} m3</p>
              {Object.keys(c.byRoute ?? {}).length > 0 && (
                <table className="mt-1 w-full text-[11px]">
                  <tbody className="divide-y divide-gray-100">
                    {Object.values(c.byRoute as Record<string, any>).map((r: any) => (
                      <tr key={r.routeId ?? r.routeName}>
                        <td className="py-1 pl-2">{r.routeName} {r.type ? `(${r.type})` : ''}</td>
                        <td className="py-1 text-right">{r.count}</td>
                        <td className="py-1 text-right">{Number(r.totalWeight).toFixed(2)} kg</td>
                        <td className="py-1 text-right">{Number(r.totalVolume).toFixed(3)} m3</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(manifests.length > 0 || hasComparison) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {manifests.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openManifestPDF(`/manifests/${m.id}/pdf`, `${m.number}.pdf`)}
                      className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50"
                    >
                      <FileText className="h-3 w-3" />
                      {m.type === 'DISPATCH' ? "Bordereau d'envoi" : 'Bordereau de reception'}
                    </button>
                  ))}
                  {hasComparison && (
                    <button
                      type="button"
                      onClick={() => openManifestPDF(`/manifests/comparison/${c.id}/pdf`, `comparaison-${c.designation}.pdf`)}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                    >
                      <FileText className="h-3 w-3" />
                      Bordereau de comparaison
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function FundTransfersSection({ outgoing, incoming, outTotal, inTotal }: { outgoing?: any[]; incoming?: any[]; outTotal?: number; inTotal?: number }) {
  const out = outgoing ?? [];
  const inn = incoming ?? [];
  if (out.length === 0 && inn.length === 0) return null;
  const renderTable = (rows: any[], direction: 'OUT' | 'IN') => (
    <table className="w-full text-xs">
      <thead className="text-left text-gray-500">
        <tr>
          <th className="py-1">Reference</th>
          <th className="py-1">{direction === 'OUT' ? 'Destination' : 'Source'}</th>
          <th className="py-1">Methode</th>
          <th className="py-1">Statut</th>
          <th className="py-1 text-right">Montant</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="py-1.5 font-mono text-[11px]">{t.reference}</td>
            <td className="py-1.5">{t.counterpart}</td>
            <td className="py-1.5 text-gray-600">{t.transferMethod}</td>
            <td className="py-1.5"><AppBadge variant={t.status === 'CONFIRMED' ? 'success' : t.status === 'PENDING' ? 'warning' : 'default'}>{t.status}</AppBadge></td>
            <td className={`py-1.5 text-right font-medium ${direction === 'OUT' ? 'text-red-600' : 'text-green-600'}`}>
              {direction === 'OUT' ? '-' : '+'}{formatAmount(t.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      {out.length > 0 && (
        <Section title={`Transferts de fonds sortants (${formatAmount(outTotal ?? 0)})`}>
          {renderTable(out, 'OUT')}
        </Section>
      )}
      {inn.length > 0 && (
        <Section title={`Transferts de fonds entrants (${formatAmount(inTotal ?? 0)})`}>
          {renderTable(inn, 'IN')}
        </Section>
      )}
    </>
  );
}

function AttachmentRow({ att, onOpen, onSaveCaption, onDelete }: { att: Attachment; onOpen: () => void; onSaveCaption: (c: string) => void; onDelete: () => void }) {
  const [caption, setCaption] = useState(att.caption ?? '');
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 items-center gap-2 truncate text-primary-700 hover:underline"
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{att.caption || att.fileName || 'piece-jointe'}</span>
          {att.fileName && att.caption && <span className="text-gray-400 truncate">({att.fileName})</span>}
        </button>
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100">Libelle</button>
        <button type="button" onClick={onDelete} className="rounded-lg p-1 text-red-500 hover:bg-red-50" aria-label="Supprimer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Libelle (ex: Facture electricite mars)"
            className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => { onSaveCaption(caption); setEditing(false); }}
            className="rounded-lg bg-primary-700 px-2 py-1 text-xs font-medium text-white hover:bg-primary-900"
          >
            Sauver
          </button>
        </div>
      )}
    </li>
  );
}

function NonImageAttachmentInput({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
  return (
    <label className="flex h-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50/40">
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

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
import { formatAmount, formatDate, formatDateTime } from '@transitsoftservices/shared';
import { ChevronDown, ChevronRight, FileText, Lock, Mail, Paperclip, Printer, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  AttachmentRow,
  ContainerList,
  FundTransfersSection,
  KV,
  NonImageAttachmentInput,
  PaymentBreakdown,
  RouteMassVolume,
  Section,
  Stat,
  type Attachment,
} from './reportSections';
import { buildDetailSpecs } from './ReportDetailDialog';

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
          Les rapports sont generes et clotures automatiquement a l&apos;heure de
          fermeture de l&apos;agence (planning horaire). Vous pouvez aussi en generer
          un manuellement pour la journee en cours.
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
            {/* report.date = jour agence encode UTC midnight -> affiche en UTC
                pour ne jamais glisser de jour selon le fuseau du navigateur. */}
            <p className="text-sm font-medium">Rapport du {formatDate(date, 'UTC')}</p>
            <p className="text-xs text-gray-500">
              {payload.totalParcels ?? 0} colis recus
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
  // Specs des popups "Voir les details" : regle de calcul + elements pris en
  // compte pour chaque section (payload.details, servi par le GET individuel).
  const specs = buildDetailSpecs(payload);

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
            Dernier envoi mail : {formatDateTime(report.emailedAt)}
          </span>
        )}
        {/* Un rapport cloture est immuable : plus de regeneration possible. */}
        {!report.closedAt && (
          <AppButton size="sm" variant="outline" onClick={regenerate} loading={regenerating}>
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerer
          </AppButton>
        )}
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
        <Stat label="Recettes" value={'+' + formatAmount(payload.recetteTotal ?? 0)} positive detail={specs.recette} />
        <Stat label="Paiements en avance" value={'+' + formatAmount(payload.advancesTotal ?? 0)} detail={specs.avances} />
        <Stat label="Depenses" value={'-' + formatAmount(payload.expensesTotal ?? 0)} negative detail={specs.expenses} />
        <Stat
          label="Solde caisse"
          value={formatAmount(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0)}
          positive={Number(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0) >= 0}
          negative={Number(payload.cashRegister?.closingBalance ?? payload.cashRegister?.currentBalance ?? 0) < 0}
          detail={specs.cash}
        />
      </div>

      {/* Entrees par mode transit + methode */}
      {payload.entriesByTransitMethod && Object.keys(payload.entriesByTransitMethod).length > 0 && (
        <Section title="Entrees du jour par mode de transit et de paiement" detail={specs.entries}>
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
      <PaymentBreakdown title="Recettes (paiements sur colis arrives a destination)" data={payload.recetteByRouteAndMethod} total={payload.recetteTotal} positive detail={specs.recette} />
      <PaymentBreakdown title="Paiements en avance (colis pas encore arrives a destination)" data={payload.advancesByRouteAndMethod} total={payload.advancesTotal} detail={specs.avances} />

      {/* Masse / volume colis enregistres */}
      <RouteMassVolume
        title="Flux du jour - Entrees (colis entres dans l'agence)"
        data={payload.flow?.in?.byRoute ?? payload.registeredByRoute}
        totalWeight={payload.flow?.in?.totalWeight}
        totalVolume={payload.flow?.in?.totalVolume}
        detail={specs.flowIn}
      />
      <RouteMassVolume
        title="Flux du jour - Sorties (colis ayant quitte l'agence)"
        data={payload.flow?.out?.byRoute}
        totalWeight={payload.flow?.out?.totalWeight}
        totalVolume={payload.flow?.out?.totalVolume}
        detail={specs.flowOut}
      />
      {/* Ventilation des sorties : remises client vs departs en transit */}
      {payload.flow?.out?.byType && (
        <>
          <RouteMassVolume
            title="Sorties - Remis aux clients"
            data={payload.flow.out.byType.handedOver?.byRoute}
            totalWeight={payload.flow.out.byType.handedOver?.totalWeight}
            totalVolume={payload.flow.out.byType.handedOver?.totalVolume}
            detail={specs.flowOutHandedOver}
          />
          <RouteMassVolume
            title="Sorties - Partis en transit (charges en conteneur)"
            data={payload.flow.out.byType.toTransit?.byRoute}
            totalWeight={payload.flow.out.byType.toTransit?.totalWeight}
            totalVolume={payload.flow.out.byType.toTransit?.totalVolume}
            detail={specs.flowOutToTransit}
          />
        </>
      )}

      {/* Conteneurs recus / envoyes */}
      <ContainerList title="Conteneurs recus du jour" containers={payload.receivedContainers} dateLabel="Arrive le" dateField="arrivalDate" manifestVariant="received" detail={specs.containersReceived} />
      <ContainerList title="Conteneurs envoyes du jour" containers={payload.sentContainers} dateLabel="Parti le" dateField="departureDate" manifestVariant="sent" detail={specs.containersSent} />

      {/* Mouvements stock */}
      <RouteMassVolume title="Entrees en stock par route" data={payload.stockIn?.byRoute} totalWeight={payload.stockIn?.totalWeight} totalVolume={payload.stockIn?.totalVolume} detail={specs.stockIn} />
      <RouteMassVolume title="Sorties de stock par route" data={payload.stockOut?.byRoute} totalWeight={payload.stockOut?.totalWeight} totalVolume={payload.stockOut?.totalVolume} detail={specs.stockOut} />
      <RouteMassVolume
        title={`Etat de stock actuel - valeur totale ${formatAmount(payload.stockState?.totalValue ?? 0)}`}
        data={payload.stockState?.byRoute}
        totalWeight={payload.stockState?.totalWeight}
        totalVolume={payload.stockState?.totalVolume}
        detail={specs.stockState}
      />

      {/* Transferts de fonds */}
      <FundTransfersSection
        outgoing={payload.fundTransfersOut}
        incoming={payload.fundTransfersIn}
        outTotal={payload.fundTransfersOutTotal}
        inTotal={payload.fundTransfersInTotal}
        detail={specs.transfers}
      />

      {/* Inventaires */}
      {Array.isArray(payload.inventories) && payload.inventories.length > 0 && (
        <Section title="Inventaire(s) du jour" detail={specs.inventories}>
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
        <Section title="Solde caisse" detail={specs.cash}>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <KV label="Ouverture" value={formatAmount(payload.cashRegister.openingBalance ?? 0)} />
            <KV label="Entrees" value={'+' + formatAmount(payload.cashRegister.totalEntries ?? 0)} positive />
            <KV label="Sorties" value={'-' + formatAmount(payload.cashRegister.totalExits ?? 0)} negative />
            <KV label="Solde courant" value={formatAmount(payload.cashRegister.currentBalance ?? 0)} bold />
            {payload.cashRegister.closingBalance != null && <KV label="Solde cloture" value={formatAmount(payload.cashRegister.closingBalance)} bold />}
            {payload.cashRegister.closedAt && <KV label="Cloturee le" value={formatDateTime(payload.cashRegister.closedAt)} />}
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
          {/* Cloture manuelle possible UNIQUEMENT si le rapport n'a jamais
              ete cloture (closedAt vide). Un rapport annote apres cloture
              passe AMENDED mais garde closedAt -> bouton masque. */}
          {!report.closedAt && (
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

'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { AppBadge } from '@/components/ui/AppBadge';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DetailButton, type DetailSpec } from './ReportDetailDialog';

/** Composants presentationnels des sections du rapport journalier. */

export interface Attachment {
  id: string;
  url: string;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  caption: string | null;
  createdAt: string;
}

export function Stat({ label, value, positive, negative, detail }: { label: string; value: string; positive?: boolean; negative?: boolean; detail?: DetailSpec }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
        <DetailButton spec={detail} />
      </div>
      <p className={`mt-1 text-base font-bold ${positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export function Section({ title, detail, children }: { title: string; detail?: DetailSpec; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
        <DetailButton spec={detail} />
      </div>
      <div className="rounded-xl border border-gray-100 bg-white p-3">{children}</div>
    </div>
  );
}

export function KV({ label, value, positive, negative, bold }: { label: string; value: string; positive?: boolean; negative?: boolean; bold?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm ${bold ? 'font-bold' : 'font-medium'} ${positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export function PaymentBreakdown({ title, data, total, positive, detail }: { title: string; data: Record<string, any> | undefined; total: number | undefined; positive?: boolean; detail?: DetailSpec }) {
  const rows = Object.values(data ?? {});
  if (rows.length === 0) return null;
  return (
    <Section title={title} detail={detail}>
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

export function RouteMassVolume({ title, data, totalWeight, totalVolume, detail }: { title: string; data: Record<string, any> | undefined; totalWeight?: number; totalVolume?: number; detail?: DetailSpec }) {
  const rows = Object.values(data ?? {});
  if (rows.length === 0) return null;
  return (
    <Section title={title} detail={detail}>
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

export function ContainerList({ title, containers, dateLabel, dateField, manifestVariant, detail }: { title: string; containers: any[] | undefined; dateLabel: string; dateField: string; manifestVariant: 'sent' | 'received'; detail?: DetailSpec }) {
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
    <Section title={title} detail={detail}>
      <div className="space-y-3">
        {containers.map((c: any) => {
          const manifests = (c.manifests ?? []) as Array<{ id: string; number: string; type: 'DISPATCH' | 'RECEPTION' }>;
          const hasComparison = manifestVariant === 'received' && c.hasComparison;
          return (
            <div key={c.id} className="rounded-lg bg-gray-50 p-2">
              <p className="text-xs font-semibold text-gray-800">
                {c.designation} <span className="text-gray-500">- {c.type} - {c.routeName}</span>
              </p>
              <p className="text-[11px] text-gray-500">{dateLabel} {c[dateField] ? formatDateTime(c[dateField]) : '-'} - {c.parcels} colis - {Number(c.totalWeight ?? 0).toFixed(2)} kg - {Number(c.totalVolume ?? 0).toFixed(3)} m3</p>
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

export function FundTransfersSection({ outgoing, incoming, outTotal, inTotal, detail }: { outgoing?: any[]; incoming?: any[]; outTotal?: number; inTotal?: number; detail?: DetailSpec }) {
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
        <Section title={`Transferts de fonds sortants (${formatAmount(outTotal ?? 0)})`} detail={detail}>
          {renderTable(out, 'OUT')}
        </Section>
      )}
      {inn.length > 0 && (
        <Section title={`Transferts de fonds entrants (${formatAmount(inTotal ?? 0)})`} detail={out.length === 0 ? detail : undefined}>
          {renderTable(inn, 'IN')}
        </Section>
      )}
    </>
  );
}

export function AttachmentRow({ att, onOpen, onSaveCaption, onDelete }: { att: Attachment; onOpen: () => void; onSaveCaption: (c: string) => void; onDelete: () => void }) {
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

export function NonImageAttachmentInput({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
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

'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle, Clock, Copy, Download, ArrowDown, Maximize2, Minimize2, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface Job {
  id: string;
  tenantId: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | string;
  logs: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

interface Props {
  tenantId: string;
  jobId: string;
  /** Auto-stop le polling quand le job est en etat terminal. */
  stopOnTerminal?: boolean;
}

/**
 * Affichage live des logs d'un job de provisioning. Poll toutes les 1.5s tant
 * que le job n'est pas en etat terminal (SUCCESS/FAILED). Auto-scroll en bas.
 */
export function JobLogsViewer({ tenantId, jobId, stopOnTerminal = true }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: job, isLoading, error } = useQuery<Job>({
    queryKey: ['tenant', tenantId, 'job', jobId],
    queryFn: async () =>
      (await api.get(`/tenants/${tenantId}/jobs/${jobId}`)).data?.data,
    refetchInterval: (q) => {
      if (!stopOnTerminal) return 1500;
      const s = (q.state.data as Job | undefined)?.status;
      if (s === 'SUCCESS' || s === 'FAILED') return false;
      return 1500;
    },
  });

  // Auto-scroll bas a chaque update
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [job?.logs]);

  if (isLoading && !job) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du job...
      </div>
    );
  }

  if (error) {
    return <p className="p-3 text-sm text-red-600">Erreur de chargement du job.</p>;
  }

  if (!job) return null;

  const StatusIcon =
    job.status === 'SUCCESS'
      ? CheckCircle2
      : job.status === 'FAILED'
      ? XCircle
      : job.status === 'RUNNING'
      ? Loader2
      : Clock;
  const statusColor =
    job.status === 'SUCCESS'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : job.status === 'FAILED'
      ? 'text-red-600 bg-red-50 border-red-200'
      : job.status === 'RUNNING'
      ? 'text-blue-600 bg-blue-50 border-blue-200'
      : 'text-gray-600 bg-gray-50 border-gray-200';

  const logsText = job.logs || '';

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* clipboard refuse */}
  };
  const downloadLogs = () => {
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-${job.id.slice(0, 8)}-${job.type.toLowerCase()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const scrollBottom = () => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  };

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-white shadow-2xl'
          : 'rounded-lg border bg-white shadow-sm'
      }
    >
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ' +
              statusColor
            }
          >
            <StatusIcon
              className={'h-3 w-3 ' + (job.status === 'RUNNING' ? 'animate-spin' : '')}
            />
            {job.status}
          </span>
          <span className="text-xs text-gray-500">{job.type}</span>
          <span className="font-mono text-[10px] text-gray-400">{job.id.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarBtn label={copied ? 'Copie !' : 'Copier les logs'} onClick={copyLogs}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </ToolbarBtn>
          <ToolbarBtn label="Telecharger .log" onClick={downloadLogs}>
            <Download className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn label="Scroll en bas" onClick={scrollBottom}>
            <ArrowDown className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn label={fullscreen ? 'Quitter plein ecran' : 'Plein ecran'} onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </ToolbarBtn>
        </div>
      </div>

      <pre
        ref={preRef}
        className={
          'overflow-auto bg-gray-900 p-4 text-[12px] leading-relaxed text-gray-100 ' +
          (fullscreen ? 'flex-1' : 'max-h-[60vh]')
        }
      >
{logsText || '(en attente de la 1ere ligne de log...)'}
      </pre>

      {job.errorMessage && (
        <div className="border-t bg-red-50 p-3 text-xs text-red-800">
          <p className="font-semibold">Error message :</p>
          <p className="mt-1 whitespace-pre-line">{job.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    >
      {children}
    </button>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Paperclip, RotateCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@transitsoftservices/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import type { AdminNotification } from '@/lib/api/notifications';
import {
  CHANNEL_LABEL,
  CHANNEL_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  eventKindLabel,
  canRetry,
} from './constants';

interface NotificationDetailDrawerProps {
  notification: AdminNotification | null;
  open: boolean;
  onClose: () => void;
  onRetry: (id: string) => void;
  retrying?: boolean;
}

function Field({ label, children }: { label: string; children?: ReactNode }) {
  const isEmpty = children === null || children === undefined || children === '';
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="text-sm text-gray-800 break-words">{isEmpty ? '-' : children}</div>
    </div>
  );
}

export function NotificationDetailDrawer({
  notification,
  open,
  onClose,
  onRetry,
  retrying,
}: NotificationDetailDrawerProps) {
  const n = notification;
  const attachments = n?.attachments ?? [];
  const showRetry = n ? canRetry(n.status, n.type) : false;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[min(480px,92vw)] max-w-none gap-0 p-0"
      >
        <SheetHeader className="border-b border-gray-100 p-5 pr-12">
          <SheetTitle className="text-base font-semibold text-gray-900">
            {n?.title || 'Notification'}
          </SheetTitle>
          {n && (
            <SheetDescription className="flex flex-wrap items-center gap-2 pt-1">
              <AppBadge variant={CHANNEL_VARIANT[n.type]}>{CHANNEL_LABEL[n.type]}</AppBadge>
              <AppBadge variant={STATUS_VARIANT[n.status]}>{STATUS_LABEL[n.status]}</AppBadge>
            </SheetDescription>
          )}
        </SheetHeader>

        {n && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
            <Field label="Message">
              <p className="whitespace-pre-wrap text-sm text-gray-700">{n.message}</p>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Objet">{eventKindLabel(n.eventKind)}</Field>
              <Field label="Destinataire">{n.recipient}</Field>
              <Field label="Client">{n.client?.fullName}</Field>
              <Field label="Agence">{n.agency?.name}</Field>
              <Field label="Tentatives">{n.retryCount}</Field>
              <Field label="Derniere tentative">
                {n.lastRetryAt ? formatDateTime(n.lastRetryAt) : '-'}
              </Field>
              <Field label="Cree le">{formatDateTime(n.createdAt)}</Field>
              <Field label="Envoye le">{n.sentAt ? formatDateTime(n.sentAt) : '-'}</Field>
            </div>

            {n.status === 'FAILED' && n.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Erreur</span>
                </div>
                <p className="mt-1 text-sm text-red-700 break-words">{n.error}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <Paperclip className="h-3.5 w-3.5" />
                Pieces jointes ({attachments.length})
              </p>
              {attachments.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune piece jointe</p>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((a, i) => (
                    <li key={`${a.url}-${i}`}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm text-primary-700 transition-colors hover:bg-primary-50"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0 text-primary-600" />
                        <span className="truncate">{a.filename || a.url}</span>
                      </a>
                      {a.caption && <p className="px-3 pt-0.5 text-xs text-gray-400">{a.caption}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {n && showRetry && (
          <div className="border-t border-gray-100 p-4">
            <AppButton
              className="w-full"
              loading={retrying}
              onClick={() => onRetry(n.id)}
            >
              <RotateCw className="h-4 w-4" />
              Renvoyer
            </AppButton>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Mail, MessageCircle, Phone, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { notificationConfigApi } from '@/lib/api/config';
import type {
  NotificationConfig,
  NotificationGlobalChannels,
  NotificationEventChannels,
  NotificationEventDef,
  NotificationTemplate,
} from '@/lib/api/config';
import { NotificationTemplateModal } from './NotificationTemplateModal';

type Channel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'PUSH';

const CHANNELS: Array<{ key: Channel; label: string; Icon: React.ElementType }> = [
  { key: 'EMAIL',    label: 'Email',     Icon: Mail },
  { key: 'WHATSAPP', label: 'WhatsApp',  Icon: MessageCircle },
  { key: 'SMS',      label: 'SMS',       Icon: Phone },
  { key: 'PUSH',     label: 'Push',      Icon: Smartphone },
];

const CATEGORY_LABELS: Record<string, string> = {
  parcel: 'Colis',
  payment: 'Paiement / Pénalités',
  invoice: 'Facturation',
  loyalty: 'Fidélité',
  container: 'Conteneurs (admin)',
};

export function TenantNotificationConfig() {
  const qc = useQueryClient();

  const { data: config, isLoading: cfgLoading } = useQuery<NotificationConfig>({
    queryKey: ['notification-config'],
    queryFn: notificationConfigApi.getConfig,
  });

  const { data: events, isLoading: evtLoading } = useQuery<NotificationEventDef[]>({
    queryKey: ['notification-events'],
    queryFn: notificationConfigApi.listEvents,
  });

  const { data: templates } = useQuery<NotificationTemplate[]>({
    queryKey: ['notification-templates'],
    queryFn: notificationConfigApi.listTemplates,
  });

  const [templateModal, setTemplateModal] = useState<{ eventKind: string; channel: Channel } | null>(null);

  const patchChannels = useMutation({
    mutationFn: (ch: Partial<NotificationGlobalChannels>) => notificationConfigApi.patchChannels(ch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-config'] });
      toast.success('Canaux mis à jour');
    },
    onError: () => toast.error('Échec de la mise à jour'),
  });

  const patchEventChannels = useMutation({
    mutationFn: ({ kind, ch }: { kind: string; ch: NotificationEventChannels }) =>
      notificationConfigApi.patchEventChannels(kind, ch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-config'] });
    },
    onError: () => toast.error('Échec de la mise à jour'),
  });

  const templateMap = useMemo(() => {
    const map = new Map<string, NotificationTemplate>();
    templates?.forEach((t) => map.set(`${t.eventKind}:${t.channel}`, t));
    return map;
  }, [templates]);

  // Canaux globalement actifs (pour filtrer la matrice events)
  const enabledGlobalChannels = useMemo((): Channel[] => {
    if (!config) return ['EMAIL', 'WHATSAPP'];
    return CHANNELS
      .filter((c) => config.channels[c.key.toLowerCase() as keyof NotificationGlobalChannels] !== false)
      .map((c) => c.key);
  }, [config]);

  // Grouper les events par catégorie
  const eventsByCategory = useMemo(() => {
    if (!events) return {};
    return events.reduce<Record<string, NotificationEventDef[]>>((acc, e) => {
      const cat = e.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(e);
      return acc;
    }, {});
  }, [events]);

  if (cfgLoading || evtLoading) return <DashboardSkeleton />;

  const channels = config?.channels ?? { email: true, whatsapp: true, sms: false, push: false };
  const eventConfig = config?.events ?? {};

  const getEventChannelValue = (kind: string, ch: Channel): boolean => {
    const override = eventConfig[kind]?.[ch.toLowerCase() as keyof typeof eventConfig[string]];
    if (override !== undefined) return override as boolean;
    return channels[ch.toLowerCase() as keyof typeof channels] !== false;
  };

  const openTemplateModal = (eventKind: string, channel: Channel) => {
    setTemplateModal({ eventKind, channel });
  };

  const activeTemplate = templateModal
    ? templateMap.get(`${templateModal.eventKind}:${templateModal.channel}`)
    : null;

  const activEventDef = templateModal
    ? events?.find((e) => e.kind === templateModal.eventKind)
    : null;

  return (
    <div className="space-y-6">
      {/* Section 1 : Master switches */}
      <AppCard>
        <AppCardHeader
          title="Canaux globaux"
          description="Activer ou désactiver entièrement un canal pour ce tenant. Un canal désactivé ici n'apparaît plus dans la matrice ci-dessous."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CHANNELS.map(({ key, label, Icon }) => (
            <div
              key={key}
              className={`flex flex-col items-center gap-3 rounded-xl border p-4 transition-colors ${
                channels[key.toLowerCase() as keyof typeof channels]
                  ? 'border-primary-200 bg-primary-50'
                  : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <Icon className="h-6 w-6 text-primary-600" />
              <span className="text-sm font-medium text-gray-800">{label}</span>
              <AppSwitch
                checked={channels[key.toLowerCase() as keyof typeof channels] !== false}
                onCheckedChange={(v) => patchChannels.mutate({ [key.toLowerCase()]: v })}
                disabled={patchChannels.isPending}
              />
            </div>
          ))}
        </div>
        {enabledGlobalChannels.length === 0 && (
          <p className="mt-3 text-sm text-amber-600">
            Tous les canaux sont désactivés. Aucune notification externe ne sera envoyée.
          </p>
        )}
      </AppCard>

      {/* Section 2 : Matrice events × canaux */}
      <AppCard>
        <AppCardHeader
          title="Config par événement"
          description="Activez ou désactivez les canaux canal par canal pour chaque type d'événement. Seuls les canaux activés globalement apparaissent ici. Cliquez sur le crayon pour personnaliser le template de message."
        />

        {enabledGlobalChannels.length === 0 ? (
          <p className="text-sm text-gray-500">Activez au moins un canal global pour configurer les événements.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(eventsByCategory).map(([category, categoryEvents]) => (
              <div key={category}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  <Bell className="h-3.5 w-3.5" />
                  {CATEGORY_LABELS[category] ?? category}
                </h3>

                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="p-3 text-left text-xs font-medium text-gray-500">Événement</th>
                        {enabledGlobalChannels.map((ch) => {
                          const def = CHANNELS.find((c) => c.key === ch)!;
                          return (
                            <th key={ch} className="p-3 text-center text-xs font-medium text-gray-500">
                              {def.label}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {categoryEvents.map((evt) => (
                        <tr key={evt.kind} className="hover:bg-gray-50/60">
                          <td className="max-w-xs p-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-gray-900">{evt.label}</div>
                                <div className="text-xs text-gray-400">{evt.description}</div>
                              </div>
                              {evt.recipient === 'admin' && (
                                <AppBadge variant="info" className="shrink-0 text-xs">admin</AppBadge>
                              )}
                            </div>
                          </td>
                          {enabledGlobalChannels.map((ch) => {
                            const active = getEventChannelValue(evt.kind, ch);
                            const tmpl = templateMap.get(`${evt.kind}:${ch}`);
                            return (
                              <td key={ch} className="p-3">
                                <div className="flex flex-col items-center gap-1.5">
                                  <AppSwitch
                                    checked={active}
                                    onCheckedChange={(v) =>
                                      patchEventChannels.mutate({
                                        kind: evt.kind,
                                        ch: { [ch.toLowerCase()]: v } as NotificationEventChannels,
                                      })
                                    }
                                    disabled={patchEventChannels.isPending}
                                  />
                                  {active && (
                                    <AppButton
                                      variant="ghost"
                                      className="h-6 px-1.5 text-xs text-gray-400 hover:text-primary-700"
                                      onClick={() => openTemplateModal(evt.kind, ch)}
                                      title={tmpl ? 'Template personnalisé' : 'Ajouter un template'}
                                    >
                                      <Pencil className="h-3 w-3" />
                                      {tmpl?.isActive ? (
                                        <span className="text-primary-600">Perso</span>
                                      ) : (
                                        <span>Défaut</span>
                                      )}
                                    </AppButton>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      {/* Modal template */}
      {templateModal && activEventDef && (
        <NotificationTemplateModal
          open
          onClose={() => setTemplateModal(null)}
          eventDef={activEventDef}
          channel={templateModal.channel}
          existingTemplate={activeTemplate ?? null}
        />
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { toast } from 'sonner';

type Channel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
type Prefs = Record<string, { channels: Channel[] }>;

// Catalogue des events notifiables et leur libelle FR.
const EVENT_KINDS: Array<{ key: string; label: string; description: string }> = [
  { key: 'PARCEL_CREATED',   label: 'Colis enregistre',    description: 'Quand un nouveau colis vous est attribue.' },
  { key: 'PARCEL_ARRIVED',   label: 'Colis arrive',        description: 'Quand un colis arrive a destination.' },
  { key: 'PARCEL_DELIVERED', label: 'Colis livre',         description: 'Quand un colis est remis au destinataire.' },
  { key: 'PAYMENT_RECEIVED', label: 'Paiement recu',       description: 'A chaque encaissement sur une de vos factures.' },
  { key: 'PENALTY_APPLIED',  label: 'Penalite appliquee',  description: 'En cas de penalite de stockage.' },
];

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: 'IN_APP',   label: 'In-app' },
  { key: 'EMAIL',    label: 'Email' },
  { key: 'SMS',      label: 'SMS' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'PUSH',     label: 'Push' },
];

// Defaut : tous les canaux actifs sur tous les events (opt-out).
const DEFAULT_CHANNELS: Channel[] = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'];

/**
 * Matrice de preferences notification (events x canaux) de l'utilisateur courant.
 * Composant partage entre la page Profil et la page Parametres > Notifications.
 */
export function NotificationPrefsForm() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'notification-prefs'],
    queryFn: () => apiClient.get('/me/notification-prefs').then((r) => r.data),
  });

  const [draft, setDraft] = useState<Prefs>({});
  const initial = useMemo<Prefs>(() => (data?.data ?? {}) as Prefs, [data]);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const update = useMutation({
    mutationFn: (prefs: Prefs) =>
      apiClient.put('/me/notification-prefs', prefs).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'notification-prefs'] });
      toast.success('Preferences enregistrees');
    },
    onError: () => toast.error('Echec de l\'enregistrement'),
  });

  const channelsFor = (kind: string): Channel[] => draft[kind]?.channels ?? DEFAULT_CHANNELS;

  const toggle = (kind: string, channel: Channel) => {
    setDraft((prev) => {
      const cur = channelsFor(kind);
      const next = cur.includes(channel) ? cur.filter((c) => c !== channel) : [...cur, channel];
      return { ...prev, [kind]: { channels: next } };
    });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5">
      <AppCard>
        <AppCardHeader
          title="Matrice canaux"
          description="Cochez les canaux qui vous conviennent. Un evenement avec aucun canal coche ne vous notifiera pas."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left p-2 font-medium text-gray-600">Evenement</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="p-2 text-center font-medium text-gray-600">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {EVENT_KINDS.map((evt) => {
                const active = channelsFor(evt.key);
                return (
                  <tr key={evt.key} className="hover:bg-gray-50">
                    <td className="p-2 align-top">
                      <div className="font-medium text-gray-900">{evt.label}</div>
                      <div className="text-xs text-gray-500">{evt.description}</div>
                    </td>
                    {CHANNELS.map((c) => (
                      <td key={c.key} className="p-2 text-center">
                        <AppCheckbox
                          checked={active.includes(c.key)}
                          onCheckedChange={() => toggle(evt.key, c.key)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
          <strong>Note :</strong> les canaux SMS, WhatsApp et Push depend d&apos;une configuration de
          provider cote serveur. Si le provider n&apos;est pas branche, ces canaux sont
          automatiquement ignores (pas d&apos;erreur, pas d&apos;envoi).
        </p>
      </AppCard>

      <div className="flex justify-end">
        <AppButton onClick={() => update.mutate(draft)} loading={update.isPending} disabled={!dirty}>
          <Save className="h-4 w-4" />
          Enregistrer
        </AppButton>
      </div>
    </div>
  );
}

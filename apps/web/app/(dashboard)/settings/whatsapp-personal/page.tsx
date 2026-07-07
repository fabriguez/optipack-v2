'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Loader2, Wifi, WifiOff, AlertTriangle, Save, PlugZap, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { whatsappPersonalApi, type WaSessionState } from '@/lib/api/config';

const STATUS_META: Record<string, { label: string; color: string }> = {
  connected: { label: 'Connecté', color: 'text-emerald-600' },
  qr: { label: 'En attente de scan (dashboard)', color: 'text-amber-600' },
  connecting: { label: 'Connexion en cours', color: 'text-blue-600' },
  syncing: { label: 'Synchronisation', color: 'text-blue-600' },
  disconnected: { label: 'Déconnecté', color: 'text-gray-500' },
  logged_out: { label: 'Session fermée', color: 'text-red-600' },
  created: { label: 'Créée (pas encore connectée)', color: 'text-gray-500' },
  NOT_CONFIGURED: { label: 'Non configuré', color: 'text-gray-500' },
  NO_BASE_URL: { label: 'Base URL manquante', color: 'text-red-600' },
  UNREACHABLE: { label: 'API injoignable / clé invalide', color: 'text-red-600' },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: 'text-gray-500' };
}

export default function WhatsAppPersonalPage() {
  const qc = useQueryClient();

  const { data: state, isLoading } = useQuery<WaSessionState>({
    queryKey: ['wa-personal-status'],
    queryFn: whatsappPersonalApi.getStatus,
    // Rafraîchit tant qu'on n'est pas connecté (le scan se fait sur le dashboard externe).
    refetchInterval: (query) => (query.state.data?.status === 'connected' ? false : 5000),
  });

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (state) setEnabled(state.enabled);
  }, [state]);

  const save = useMutation({
    mutationFn: () =>
      whatsappPersonalApi.saveConfig({
        enabled,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Configuration enregistrée');
      setApiKey('');
      setBaseUrl('');
      qc.invalidateQueries({ queryKey: ['wa-personal-status'] });
    },
    onError: () => toast.error("Échec de l'enregistrement"),
  });

  const test = useMutation({
    mutationFn: () =>
      whatsappPersonalApi.testConnection({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      }),
    onSuccess: (s) =>
      toast.success(
        `Connexion OK — statut « ${statusMeta(s.status).label} »${s.phoneNumber ? ` (${s.phoneNumber})` : ''}`,
      ),
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Échec de la connexion';
      toast.error(msg);
    },
  });

  const clear = useMutation({
    mutationFn: whatsappPersonalApi.clear,
    onSuccess: () => {
      toast.success('Configuration effacée');
      setApiKey('');
      setBaseUrl('');
      qc.invalidateQueries({ queryKey: ['wa-personal-status'] });
    },
    onError: () => toast.error("Échec de l'effacement"),
  });

  if (isLoading) return <DashboardSkeleton />;

  const status = state?.status ?? 'NOT_CONFIGURED';
  const meta = statusMeta(status);
  const isConnected = status === 'connected';
  const configured = state?.configured ?? false;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageCircle className="h-6 w-6 text-primary-600" />
          WhatsApp Personnel
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Connectez votre session WhatsApp via l&apos;API interne. La connexion (QR code) se fait
          sur le dashboard WhatsApp, qui vous fournit une clé API à coller ici. Les notifications de
          votre organisation partent ensuite depuis cette session.
        </p>
      </header>

      {/* Statut */}
      <AppCard>
        <AppCardHeader
          title="Statut de la session"
          description="État de la session liée à votre clé API, interrogé en direct auprès de l'API WhatsApp."
        />

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <Wifi className="h-8 w-8 text-emerald-500" />
            ) : status === 'UNREACHABLE' || status === 'NO_BASE_URL' || status === 'logged_out' ? (
              <AlertTriangle className="h-8 w-8 text-red-500" />
            ) : status === 'connecting' || status === 'syncing' ? (
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            ) : (
              <WifiOff className="h-8 w-8 text-gray-400" />
            )}
            <div>
              <p className={`text-lg font-semibold ${meta.color}`}>{meta.label}</p>
              {isConnected && state?.connectedPhone && (
                <p className="text-sm text-gray-500">{state.connectedPhone}</p>
              )}
              {state?.lastError && !isConnected && (
                <p className="mt-1 text-xs text-red-500">{state.lastError}</p>
              )}
              {state?.enabled === false && configured && (
                <p className="mt-1 text-xs text-amber-600">
                  Canal désactivé — activez-le pour envoyer les notifications via WhatsApp.
                </p>
              )}
            </div>
          </div>

          <div className="sm:ml-auto">
            <AppButton
              variant="outline"
              onClick={() => test.mutate()}
              loading={test.isPending}
              disabled={!configured && !apiKey.trim()}
            >
              <PlugZap className="h-4 w-4" />
              Tester la connexion
            </AppButton>
          </div>
        </div>
      </AppCard>

      {/* Config des variables */}
      <AppCard>
        <AppCardHeader
          title="Variables de la session"
          description="Clé API de votre session (générée sur le dashboard WhatsApp) et base URL de l'API. Laissez la base URL vide pour utiliser celle par défaut du serveur."
        />

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Clé API (x-api-key)</label>
            <AppInput
              type="password"
              autoComplete="off"
              placeholder={configured ? '•••••••••• (enregistrée — laissez vide pour conserver)' : 'Collez la clé API de votre session'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Scopée à une session. Générée sur le dashboard WhatsApp lors de la connexion de votre numéro.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Base URL de l&apos;API (optionnel)</label>
            <AppInput
              type="url"
              placeholder={state?.baseUrl ?? 'https://whatsapp-api.transitsoftservices.com'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Laissez vide pour utiliser la base URL configurée sur le serveur (WA_API_URL).
            </p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">
              Activer le canal WhatsApp personnel pour cette organisation
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <AppButton
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => clear.mutate()}
            loading={clear.isPending}
            disabled={!configured}
          >
            <Trash2 className="h-4 w-4" />
            Effacer
          </AppButton>

          <AppButton onClick={() => save.mutate()} loading={save.isPending}>
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </AppCard>

      {/* Info */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">À propos du canal WhatsApp personnel</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
          <li>La connexion (scan du QR) et le rate limit se gèrent sur le dashboard WhatsApp externe.</li>
          <li>Ce canal envoie du texte (les pièces jointes sont ajoutées en liens dans le message).</li>
          <li>Quand il est activé et connecté, il est utilisé en priorité sur les providers (Twilio, Meta…).</li>
          <li>Assurez-vous que vos clients ont consenti à recevoir des messages WhatsApp.</li>
        </ul>
      </div>
    </div>
  );
}

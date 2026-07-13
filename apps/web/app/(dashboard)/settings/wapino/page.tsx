'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareMore, CheckCircle2, AlertTriangle, CircleOff, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { wapinoApi, type WapinoState } from '@/lib/api/config';

/**
 * Config Wapino (https://wapino.consolidis.com) — canal WhatsApp de SECOURS.
 * Endroit de config distinct du canal WhatsApp personnel : les deux peuvent
 * être configurés/connectés en même temps ; l'envoi tente le canal perso
 * d'abord, Wapino ensuite.
 */
export default function WapinoSettingsPage() {
  const qc = useQueryClient();

  const { data: state, isLoading } = useQuery<WapinoState>({
    queryKey: ['wapino-status'],
    queryFn: wapinoApi.getStatus,
  });

  const [apiKey, setApiKey] = useState('');
  const [instance, setInstance] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    if (state) {
      setEnabled(state.enabled);
      setInstance(state.instance ?? '');
    }
  }, [state]);

  const save = useMutation({
    mutationFn: () =>
      wapinoApi.saveConfig({
        enabled,
        instance,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Configuration Wapino enregistrée');
      setApiKey('');
      setBaseUrl('');
      qc.invalidateQueries({ queryKey: ['wapino-status'] });
    },
    onError: () => toast.error("Échec de l'enregistrement"),
  });

  const test = useMutation({
    mutationFn: () =>
      wapinoApi.testConnection({
        phone: testPhone.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(instance.trim() ? { instance: instance.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Message de test envoyé via Wapino — vérifiez le téléphone.');
      qc.invalidateQueries({ queryKey: ['wapino-status'] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Échec du test Wapino';
      toast.error(msg);
      qc.invalidateQueries({ queryKey: ['wapino-status'] });
    },
  });

  const clear = useMutation({
    mutationFn: wapinoApi.clear,
    onSuccess: () => {
      toast.success('Configuration Wapino effacée');
      setApiKey('');
      setBaseUrl('');
      qc.invalidateQueries({ queryKey: ['wapino-status'] });
    },
    onError: () => toast.error("Échec de l'effacement"),
  });

  if (isLoading) return <DashboardSkeleton />;

  const configured = state?.configured ?? false;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquareMore className="h-6 w-6 text-primary-600" />
          Wapino — WhatsApp de secours
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Wapino (wapino.consolidis.com) est le canal WhatsApp de repli : quand votre canal
          WhatsApp personnel échoue ou n&apos;est pas configuré, les notifications partent via
          Wapino. Les deux canaux peuvent rester connectés en même temps — le canal personnel
          garde la priorité.
        </p>
      </header>

      {/* Statut */}
      <AppCard>
        <AppCardHeader
          title="État du fallback"
          description="Wapino n'expose pas de statut de session à la clé API : l'état reflète la config et le dernier envoi."
        />
        <div className="flex items-center gap-3">
          {configured && state?.enabled && !state?.lastError ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          ) : state?.lastError ? (
            <AlertTriangle className="h-8 w-8 text-red-500" />
          ) : (
            <CircleOff className="h-8 w-8 text-gray-400" />
          )}
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {!configured
                ? 'Non configuré'
                : !state?.enabled
                  ? 'Configuré mais désactivé'
                  : state?.lastError
                    ? 'Dernier envoi en erreur'
                    : 'Actif (fallback prêt)'}
            </p>
            {state?.lastOkAt && (
              <p className="text-xs text-gray-500">
                Dernier envoi OK : {new Date(state.lastOkAt).toLocaleString('fr-FR')}
              </p>
            )}
            {state?.lastError && <p className="mt-1 text-xs text-red-500">{state.lastError}</p>}
          </div>
        </div>
      </AppCard>

      {/* Config */}
      <AppCard>
        <AppCardHeader
          title="Configuration Wapino"
          description="Clé API générée sur le dashboard Wapino (Paramètres > Clés API) et nom de votre instance."
        />
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Clé API Wapino</label>
            <AppInput
              type="password"
              autoComplete="off"
              placeholder={configured ? '•••••••••• (enregistrée — laissez vide pour conserver)' : 'wp_live_...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Envoyée en Authorization: Bearer sur api.wapino.consolidis.com.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Instance Wapino</label>
            <AppInput
              placeholder="MaBoutique"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Nom de l&apos;instance connectée sur votre compte Wapino. Requis pour l&apos;envoi de
              documents (factures PDF) ; sans instance, seul le texte part (endpoint legacy).
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Base URL de l&apos;API (optionnel)</label>
            <AppInput
              type="url"
              placeholder={state?.baseUrl ?? 'https://api.wapino.consolidis.com/v1'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">
              Activer Wapino comme fallback WhatsApp pour cette organisation
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

      {/* Test */}
      <AppCard>
        <AppCardHeader
          title="Tester l'envoi"
          description="Envoie un vrai message WhatsApp de test via Wapino au numéro indiqué (config saisie ci-dessus, sinon celle enregistrée)."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-gray-700">Numéro de test</label>
            <AppInput
              placeholder="2376XXXXXXXX"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <AppButton
            variant="outline"
            onClick={() => test.mutate()}
            loading={test.isPending}
            disabled={testPhone.trim().length < 6 || (!configured && !apiKey.trim())}
          >
            <Send className="h-4 w-4" />
            Envoyer le test
          </AppButton>
        </div>
      </AppCard>

      {/* Info */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Ordre des canaux WhatsApp</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
          <li>1. Canal WhatsApp personnel (Paramètres &gt; WhatsApp Personnel) — prioritaire.</li>
          <li>2. Wapino — utilisé si le canal personnel échoue ou n&apos;est pas configuré.</li>
          <li>Les documents (factures PDF) partent via Wapino par URL publique : votre stockage doit être accessible.</li>
          <li>Assurez-vous que vos clients ont consenti à recevoir des messages WhatsApp.</li>
        </ul>
      </div>
    </div>
  );
}

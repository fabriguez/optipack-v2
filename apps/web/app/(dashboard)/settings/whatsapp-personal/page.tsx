'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, QrCode, Loader2, Wifi, WifiOff, AlertTriangle, Save } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { whatsappPersonalApi, type WaSessionState, type WaSessionStatus } from '@/lib/api/config';

const STATUS_LABELS: Record<WaSessionStatus, string> = {
  DISCONNECTED: 'Déconnecté',
  QR_READY: 'En attente de scan',
  CONNECTING: 'Connexion en cours...',
  SYNCING: 'Synchronisation en cours...',
  CONNECTED: 'Connecté',
  BANNED: 'Banni',
};

const STATUS_COLORS: Record<WaSessionStatus, string> = {
  DISCONNECTED: 'text-gray-500',
  QR_READY: 'text-amber-600',
  CONNECTING: 'text-blue-600',
  SYNCING: 'text-blue-600',
  CONNECTED: 'text-emerald-600',
  BANNED: 'text-red-600',
};

export default function WhatsAppPersonalPage() {
  const qc = useQueryClient();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const { data: state, isLoading } = useQuery<WaSessionState>({
    queryKey: ['wa-personal-status'],
    queryFn: whatsappPersonalApi.getStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      // Poll pendant tout le cycle de connexion (scan -> synchro -> prêt) pour
      // suivre la progression du chargement en direct.
      return s === 'QR_READY' || s === 'CONNECTING' || s === 'SYNCING' ? 2000 : false;
    },
  });

  const [perHour, setPerHour] = useState(50);
  const [minDelay, setMinDelay] = useState(3);

  useEffect(() => {
    if (state) {
      // Sync rate limit depuis DB si disponible (on n'a pas ces champs dans le status,
      // donc on laisse l'admin les configurer manuellement)
    }
  }, [state]);

  // Invalider après start/disconnect
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const start = useMutation({
    mutationFn: whatsappPersonalApi.start,
    onSuccess: () => {
      toast.success('Session démarrée — le QR apparaît dans quelques secondes');
      qc.invalidateQueries({ queryKey: ['wa-personal-status'] });
    },
    onError: () => toast.error('Impossible de démarrer la session'),
  });

  const disconnect = useMutation({
    mutationFn: whatsappPersonalApi.disconnect,
    onSuccess: () => {
      toast.success('Session déconnectée');
      qc.invalidateQueries({ queryKey: ['wa-personal-status'] });
    },
    onError: () => toast.error('Erreur lors de la déconnexion'),
  });

  const updateRateLimit = useMutation({
    mutationFn: () => whatsappPersonalApi.updateRateLimit(perHour, minDelay),
    onSuccess: () => toast.success('Limites mises à jour'),
    onError: () => toast.error('Échec de la mise à jour'),
  });

  if (isLoading) return <DashboardSkeleton />;

  const status = state?.status ?? 'DISCONNECTED';
  const isConnected = status === 'CONNECTED';
  const isActiveSession = ['QR_READY', 'CONNECTING', 'SYNCING', 'CONNECTED'].includes(status);
  const loadingPercent = state?.loadingPercent ?? null;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageCircle className="h-6 w-6 text-primary-600" />
          WhatsApp Personnel
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Connectez votre propre numéro WhatsApp pour envoyer les notifications depuis votre compte.
          Les messages partent directement depuis votre WhatsApp via la session scannée.
        </p>
      </header>

      {/* Statut + QR */}
      <AppCard>
        <AppCardHeader
          title="Statut de la session"
          description="Scannez le QR code avec WhatsApp sur votre téléphone pour connecter votre compte."
        />

        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {/* Indicateur statut */}
          <div className="flex items-center gap-3">
            {isConnected ? (
              <Wifi className="h-8 w-8 text-emerald-500" />
            ) : status === 'BANNED' ? (
              <AlertTriangle className="h-8 w-8 text-red-500" />
            ) : status === 'SYNCING' || status === 'CONNECTING' ? (
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            ) : (
              <WifiOff className="h-8 w-8 text-gray-400" />
            )}
            <div>
              <p className={`text-lg font-semibold ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </p>
              {isConnected && state?.connectedPhone && (
                <p className="text-sm text-gray-500">{state.connectedPhone}</p>
              )}
              {state?.lastError && !isConnected && (
                <p className="mt-1 text-xs text-red-500">{state.lastError}</p>
              )}
            </div>
          </div>

          {/* Boutons */}
          <div className="flex gap-2 sm:ml-auto">
            {!isActiveSession ? (
              <AppButton
                onClick={() => start.mutate()}
                loading={start.isPending}
              >
                <QrCode className="h-4 w-4" />
                Connecter WhatsApp
              </AppButton>
            ) : (
              <AppButton
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => disconnect.mutate()}
                loading={disconnect.isPending}
              >
                Déconnecter
              </AppButton>
            )}
          </div>
        </div>

        {/* QR Code */}
        {status === 'QR_READY' && state?.qrCode && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-sm text-amber-700">
              Ouvrez WhatsApp sur votre téléphone → Menu → Appareils liés → Lier un appareil
            </p>
            <div className="rounded-2xl border-4 border-primary-100 bg-white p-3 shadow-sm">
              <Image
                src={state.qrCode}
                alt="QR Code WhatsApp"
                width={220}
                height={220}
                className="rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Actualisation automatique toutes les 3s
            </div>
          </div>
        )}

        {status === 'CONNECTING' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Initialisation de la session en cours...
          </div>
        )}

        {status === 'SYNCING' && (
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between text-sm font-medium text-blue-700">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement de WhatsApp
              </span>
              {loadingPercent !== null && <span>{loadingPercent}%</span>}
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${loadingPercent ?? 5}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-blue-600">
              Numéro scanné. Synchronisation des conversations en cours — la session
              n&apos;est pas encore prête à envoyer. Les notifications WhatsApp émises
              maintenant sont mises en attente et partiront automatiquement dès que le
              chargement sera terminé.
            </p>
          </div>
        )}

        {status === 'BANNED' && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Votre compte WhatsApp a été banni par WhatsApp pour envois excessifs.
            Vous devrez utiliser un autre numéro. Un email vous a été envoyé avec les détails.
          </div>
        )}
      </AppCard>

      {/* Rate Limit */}
      <AppCard>
        <AppCardHeader
          title="Limite d&apos;envoi"
          description="Configurez le quota horaire et le délai minimum entre chaque message pour éviter un blocage de votre compte WhatsApp."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Messages max par heure
            </label>
            <AppInput
              type="number"
              min={1}
              max={500}
              value={perHour}
              onChange={(e) => setPerHour(Number(e.target.value))}
            />
            <p className="text-xs text-gray-400">
              Recommandé : 30–50/h. Au-delà, risque de ban augmente.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Délai minimum entre envois (secondes)
            </label>
            <AppInput
              type="number"
              min={0}
              max={60}
              value={minDelay}
              onChange={(e) => setMinDelay(Number(e.target.value))}
            />
            <p className="text-xs text-gray-400">
              Recommandé : 3–5s. Simule un comportement humain.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <AppButton
            onClick={() => updateRateLimit.mutate()}
            loading={updateRateLimit.isPending}
          >
            <Save className="h-4 w-4" />
            Enregistrer les limites
          </AppButton>
        </div>
      </AppCard>

      {/* Info */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">À propos du canal WhatsApp personnel</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-700">
          <li>WhatsApp peut bloquer les comptes qui envoient trop de messages non sollicités.</li>
          <li>Assurez-vous que vos clients ont consenti à recevoir des messages.</li>
          <li>En cas d&apos;échec ou de ban, vous recevrez une notification email.</li>
          <li>Ce canal est utilisé en priorité sur les providers configurés (Twilio, Meta, etc.).</li>
        </ul>
      </div>
    </div>
  );
}

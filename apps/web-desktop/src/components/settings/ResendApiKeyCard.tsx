import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import {
  emailConfigApi,
  type TenantEmailConfigPatch,
} from '@/lib/api/organization';

/**
 * Carte "cle API Resend du tenant" : permet a l'admin d'envoyer les emails
 * via son propre compte Resend (cle + expediteur) au lieu du sender partage
 * de la plateforme. La cle n'est jamais relue en clair (apiKeyHint).
 */
export function ResendApiKeyCard() {
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['tenant-email-config'],
    queryFn: emailConfigApi.get,
  });

  const [useOwnKey, setUseOwnKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    if (!cfg) return;
    setUseOwnKey(cfg.provider === 'resend');
    setSenderName(cfg.senderName ?? '');
    setSenderEmail(cfg.senderEmail ?? '');
    setReplyTo(cfg.replyTo ?? '');
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => {
      const patch: TenantEmailConfigPatch = useOwnKey
        ? {
            provider: 'resend',
            senderName: senderName.trim() || undefined,
            senderEmail: senderEmail.trim() || undefined,
            replyTo: replyTo.trim() || undefined,
            ...(apiKey.trim() ? { credentials: { apiKey: apiKey.trim() } } : {}),
          }
        : { provider: 'shared' };
      return emailConfigApi.save(patch);
    },
    onSuccess: () => {
      toast.success('Configuration email enregistree');
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['tenant-email-config'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Echec de l'enregistrement";
      toast.error(msg);
    },
  });

  const hasStoredKey = !!cfg?.apiKeyHint;
  // Passer sur sa propre cle exige une cle (nouvelle ou deja enregistree) et un expediteur.
  const missingRequirements =
    useOwnKey && (!(apiKey.trim() || hasStoredKey) || !senderEmail.trim());

  return (
    <AppCard>
      <AppCardHeader
        title="Cle API Resend"
        description="Envoyez les emails depuis votre propre compte Resend (cle API + expediteur de votre domaine). Sinon, le sender partage de la plateforme est utilise."
      />

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={useOwnKey}
              onChange={(e) => setUseOwnKey(e.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">
              Utiliser ma propre cle Resend pour cette organisation
            </span>
          </label>

          {useOwnKey && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Cle API Resend (re_...)
                </label>
                <AppInput
                  type="password"
                  autoComplete="off"
                  placeholder={
                    hasStoredKey
                      ? `Enregistree (${cfg?.apiKeyHint}) — laissez vide pour conserver`
                      : 'Collez votre cle API Resend'
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  Generee sur resend.com &gt; API Keys. Stockee cote serveur, jamais reaffichee en clair.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Nom expediteur</label>
                  <AppInput
                    type="text"
                    placeholder="Acme Transit"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Email expediteur</label>
                  <AppInput
                    type="email"
                    placeholder="no-reply@votredomaine.com"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Reply-to (optionnel)</label>
                <AppInput
                  type="email"
                  placeholder="contact@votredomaine.com"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  Le domaine de l&apos;expediteur doit etre verifie sur votre compte Resend,
                  sinon l&apos;envoi retombe automatiquement sur le sender partage.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {missingRequirements && (
              <p className="text-xs text-amber-600">
                Cle API et email expediteur requis pour activer votre compte Resend.
              </p>
            )}
            <AppButton
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={missingRequirements}
            >
              {useOwnKey ? <KeyRound className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </AppButton>
          </div>
        </div>
      )}
    </AppCard>
  );
}

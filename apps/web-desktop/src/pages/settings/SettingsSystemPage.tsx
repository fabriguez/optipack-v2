import { useEffect, useState } from 'react';
import { Boxes, Globe, Save, Wrench } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppButton } from '@/components/ui/AppButton';
import { apiClient } from '@/lib/api/client';

interface StudioData {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  enabledModules: string[];
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  autoUpdatePolicy: 'MANUAL' | 'AUTO_STABLE' | 'AUTO_CRITICAL_ONLY' | null;
  pinnedVersion: string | null;
  status: string;
}

const KNOWN_MODULES = [
  { code: 'core', label: 'Core (parcels, clients, agences)' },
  { code: 'payments', label: 'Paiements en ligne' },
  { code: 'stock', label: 'Magasin / Stock' },
  { code: 'inventory', label: 'Inventaire' },
  { code: 'debts', label: 'Dette client' },
  { code: 'storage', label: 'Stockage / entreposage' },
  { code: 'web-client', label: 'Portail client public' },
  { code: 'mobile', label: 'App mobile white-label' },
];

const AUTO_UPDATE_POLICIES = [
  { value: 'MANUAL', label: 'Manuel (admin doit declencher)' },
  { value: 'AUTO_CRITICAL_ONLY', label: 'Auto critique uniquement (security/patch)' },
  { value: 'AUTO_STABLE', label: 'Auto-stable (toutes les releases stables)' },
];

export default function SettingsSystemPage() {
  const qc = useQueryClient();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [customDomain, setCustomDomain] = useState('');
  const [autoUpdatePolicy, setAutoUpdatePolicy] = useState<string>('MANUAL');
  const [pinnedVersion, setPinnedVersion] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const studio = useQuery<StudioData>({
    queryKey: ['settings', 'system-studio'],
    queryFn: async () => (await apiClient.get('/system/studio')).data?.data,
  });

  useEffect(() => {
    if (studio.data) {
      setEnabledModules(studio.data.enabledModules ?? []);
      setCustomDomain(studio.data.customDomain ?? '');
      setAutoUpdatePolicy(studio.data.autoUpdatePolicy ?? 'MANUAL');
      setPinnedVersion(studio.data.pinnedVersion ?? '');
      setHasChanges(false);
    }
  }, [studio.data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch('/system/studio', {
        enabledModules,
        customDomain: customDomain || null,
        autoUpdatePolicy,
        pinnedVersion: pinnedVersion || null,
      }),
    onSuccess: () => {
      toast.success('Configuration enregistree');
      setHasChanges(false);
      qc.invalidateQueries({ queryKey: ['settings', 'system-studio'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur a la sauvegarde');
    },
  });

  function toggleModule(code: string) {
    setEnabledModules((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code],
    );
    setHasChanges(true);
  }

  function markChanged<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setHasChanges(true);
    };
  }

  if (studio.isLoading) {
    return (
      <PageTransition>
        <div className="space-y-3">
          <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />
          <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </PageTransition>
    );
  }

  if (studio.isError) {
    return (
      <PageTransition>
        <AppCard>
          <p className="text-sm text-red-600">
            Impossible de joindre l&apos;orchestrateur. Verifiez que la variable
            d&apos;environnement <code>OPS_TENANT_PROXY_TOKEN</code> est configuree cote API.
          </p>
        </AppCard>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modules et systeme</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pilotez les modules activ&eacute;s, le domaine personnalis&eacute; et la politique de mise &agrave; jour.
          </p>
        </div>

        <AppCard>
          <AppCardHeader
            title="Modules actives"
            description="Cochez les modules disponibles pour vos utilisateurs."
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {KNOWN_MODULES.map((m) => {
              const on = enabledModules.includes(m.code);
              return (
                <label
                  key={m.code}
                  className={
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ' +
                    (on
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50')
                  }
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleModule(m.code)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="flex-1">
                    <span className="font-mono text-xs text-gray-500">{m.code}</span>
                    <span className="ml-2">{m.label}</span>
                  </span>
                  {on && <Boxes className="h-4 w-4 text-primary-600" />}
                </label>
              );
            })}
          </div>
        </AppCard>

        <AppCard>
          <AppCardHeader
            title="Domaine personnalise"
            description="Connectez votre propre nom de domaine. Pointez un CNAME vers transitsoftservices.com."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <AppInput
              label="Domaine"
              placeholder="app.entreprise.com"
              value={customDomain}
              onChange={(e) => markChanged(setCustomDomain)(e.target.value)}
            />
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Globe className="h-4 w-4" />
              <span className="font-mono text-xs">
                {studio.data?.slug}.transitsoftservices.com
              </span>
            </div>
          </div>
        </AppCard>

        <AppCard>
          <AppCardHeader
            title="Politique de mise a jour"
            description="Qui declenche les deploiements de nouvelles versions ?"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppSelect
              label="Politique"
              value={autoUpdatePolicy}
              onChange={(e) => markChanged(setAutoUpdatePolicy)(e.target.value)}
              options={AUTO_UPDATE_POLICIES}
            />
            <AppInput
              label="Version epinglee (optionnel)"
              placeholder="ex: beta-1.0.34"
              value={pinnedVersion}
              onChange={(e) => markChanged(setPinnedVersion)(e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            <Wrench className="mr-1 inline h-3 w-3" />
            La version epinglee bloque les mises a jour au-dela. Laissez vide pour suivre la politique automatique.
          </p>
        </AppCard>

        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-xs text-gray-500">
            {hasChanges ? 'Modifications non enregistrees' : 'Aucune modification'}
          </span>
          <AppButton
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!hasChanges || save.isPending}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </div>
    </PageTransition>
  );
}

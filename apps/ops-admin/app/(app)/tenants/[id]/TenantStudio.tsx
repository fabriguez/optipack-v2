'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { GhcrTagSelect } from '@/components/GhcrTagSelect';

/**
 * Personnalisation visuelle (logo, couleurs, peau/layout, theme/palette) :
 * GEREE EXCLUSIVEMENT depuis le dashboard du tenant (Parametres > Personnalisation
 * pour le logo/couleurs, Parametres > Site pour la peau/theme). L'ops-admin ne
 * pilote plus que les modules, le domaine, la politique de MAJ et la version.
 * Le logo/skin/theme ne sont donc plus exposes ici pour eviter la double source
 * de verite (et l'ops-admin n'a de toute facon pas acces aux images du tenant).
 */
interface SkinCustomization {
  primary?: string;
  accent?: string;
  radius?: number;
  fontBody?: string;
  fontHeading?: string;
  imageOverrides?: {
    hero?: string;
    authShell?: string;
    preview?: string;
  };
}

interface StudioInput {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  enabledModules: string[];
  pinnedVersion: string | null;
  autoUpdatePolicy: string | null;
  customDomain: string | null;
  skinId: string | null;
  themeId: string | null;
  skinCustomization: SkinCustomization | null;
}

interface Props {
  tenantId: string;
  initial: StudioInput;
  // Vue compte facturation tenant : lecture seule. Modules desactives, domaine
  // perso masque, bouton Enregistrer cache (le PATCH est bloque cote serveur).
  readOnly?: boolean;
}

/**
 * Liste des modules toggleables - DOIT correspondre aux `module:` declares
 * dans apps/web/components/layout/Sidebar.tsx. Sans correspondance exacte,
 * activer/desactiver un module n'a aucun effet visuel cote tenant.
 */
const KNOWN_MODULES: { code: string; label: string; group: string }[] = [
  // Operations
  { code: 'agencies', label: 'Agences', group: 'Operations' },
  { code: 'warehouses', label: 'Magasins / entrepots', group: 'Operations' },
  { code: 'clients', label: 'Clients', group: 'Operations' },
  { code: 'parcels', label: 'Colis', group: 'Operations' },
  { code: 'containers', label: 'Conteneurs', group: 'Operations' },
  { code: 'transit-routes', label: 'Routes transit', group: 'Operations' },
  // Finance
  { code: 'invoices', label: 'Factures', group: 'Finance' },
  { code: 'payments', label: 'Paiements + caisse', group: 'Finance' },
  { code: 'disbursements', label: 'Decaissements', group: 'Finance' },
  { code: 'fund-transfers', label: 'Transferts de fonds', group: 'Finance' },
  { code: 'accounting', label: 'Comptabilite', group: 'Finance' },
  { code: 'expenses', label: 'Depenses', group: 'Finance' },
  { code: 'debts', label: 'Dette client', group: 'Finance' },
  // Systeme
  { code: 'employees', label: 'Personnel', group: 'Systeme' },
  { code: 'loyalty', label: 'Fidelite', group: 'Systeme' },
  { code: 'penalties', label: 'Penalites', group: 'Systeme' },
  { code: 'chat', label: 'Support / messagerie', group: 'Systeme' },
  { code: 'reports', label: 'Rapports', group: 'Systeme' },
];

const AUTO_UPDATE_POLICIES = [
  { value: 'MANUAL', label: 'Manuel (admin doit declencher)' },
  { value: 'AUTO_CRITICAL_ONLY', label: 'Auto critique uniquement (security/patch)' },
  { value: 'AUTO_STABLE', label: 'Auto-stable (toutes les releases stables)' },
];

export function TenantStudio({ tenantId, initial, readOnly = false }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<StudioInput>(initial);
  const [saved, setSaved] = useState(false);

  const mut = useMutation({
    mutationFn: (payload: Partial<StudioInput>) =>
      api.patch(`/tenants/${tenantId}`, payload),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });

  function update<K extends keyof StudioInput>(key: K, value: StudioInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleModule(code: string) {
    setForm((f) => ({
      ...f,
      enabledModules: f.enabledModules.includes(code)
        ? f.enabledModules.filter((m) => m !== code)
        : [...f.enabledModules, code],
    }));
  }

  function submit() {
    // Le branding (logo/couleurs/peau/theme) est gere cote tenant : on ne pousse
    // ici QUE les champs operationnels pilotes par l'ops-admin.
    mut.mutate({
      enabledModules: form.enabledModules,
      pinnedVersion: form.pinnedVersion,
      autoUpdatePolicy: form.autoUpdatePolicy,
      customDomain: form.customDomain,
    });
  }

  function enableAllModules() {
    setForm((f) => ({ ...f, enabledModules: KNOWN_MODULES.map((m) => m.code) }));
  }

  function disableAllModules() {
    setForm((f) => ({ ...f, enabledModules: [] }));
  }

  const modulesByGroup = useMemo(() => {
    const groups: Record<string, typeof KNOWN_MODULES> = {};
    for (const m of KNOWN_MODULES) {
      (groups[m.group] ??= []).push(m);
    }
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Le logo, les couleurs, la peau (layout) et le theme (palette) se configurent
        desormais depuis le dashboard du tenant (Parametres &gt; Personnalisation et
        Parametres &gt; Site). Ils ne sont plus modifiables ici.
      </p>

      {/* Modules */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Modules actives
          </h3>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={enableAllModules}
                className="rounded border bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                Tout activer
              </button>
              <button
                type="button"
                onClick={disableAllModules}
                className="rounded border bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                Tout desactiver
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Coche les modules visibles pour ce tenant. Liste vide = tous actifs (compat).
          Les codes correspondent exactement aux flags du sidebar du tenant.
        </p>
        <div className="mt-3 space-y-4">
          {Object.entries(modulesByGroup).map(([group, items]) => (
            <div key={group}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group}
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((m) => {
                  const on = form.enabledModules.includes(m.code);
                  return (
                    <label
                      key={m.code}
                      className={
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm ' +
                        (readOnly ? 'cursor-not-allowed opacity-70 ' : 'cursor-pointer ') +
                        (on ? 'border-primary-300 bg-primary-50' : 'bg-white hover:bg-gray-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleModule(m.code)}
                        disabled={readOnly}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">
                        <span className="font-mono text-xs text-gray-500">{m.code}</span>
                        <span className="ml-2 text-sm">{m.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Domain + update policy : ops global uniquement (masque pour compte facturation). */}
      {!readOnly && (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Domaine personnalise" hint="ex: app.entreprise.com">
          <input
            type="text"
            value={form.customDomain ?? ''}
            onChange={(e) => update('customDomain', e.target.value || null)}
            placeholder="(vide = utilise slug.transitsoftservices.com)"
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field label="Politique de mise a jour">
          <select
            value={form.autoUpdatePolicy ?? 'MANUAL'}
            onChange={(e) => update('autoUpdatePolicy', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {AUTO_UPDATE_POLICIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Version epinglee"
          hint="Empeche les auto-update au-dessus de cette version. Vide = pas de pin."
        >
          <GhcrTagSelect
            image="optipack-api"
            value={form.pinnedVersion ?? ''}
            onChange={(v) => update('pinnedVersion', v || null)}
            placeholder="Aucune version epinglee"
            showLatest={false}
          />
        </Field>
      </div>
      )}

      {readOnly && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Vue en lecture seule. Pour modifier les modules, contactez votre administrateur.
        </p>
      )}

      {!readOnly && (
      <div className="flex items-center justify-end gap-3 border-t pt-3">
        {saved && <span className="text-xs text-emerald-600">Configuration enregistree.</span>}
        {mut.isError && (
          <span className="text-xs text-red-600">
            {(mut.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Erreur a la sauvegarde.'}
          </span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={mut.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Enregistrer
        </button>
      </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Palette, Save, Type as TypeIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { GhcrTagSelect } from '@/components/GhcrTagSelect';

/**
 * Catalogue statique des peaux disponibles - DOIT rester aligne avec
 * packages/skins/src/skins.ts (BUILTIN_SKINS). On ne fetch pas depuis
 * l'orchestrator pour rester fonctionnel meme quand celui-ci est offline
 * (dev local, restart en cours) et eviter un round-trip pour des donnees
 * statiques.
 */
const SKIN_CATALOG: SkinTokens[] = [
  {
    id: 'forest',
    name: 'Forest',
    tagline: 'Naturel & confiance - parfait pour la logistique',
    primary: '#1B5E20',
    secondary: '#4CAF50',
    accent: '#A5D6A7',
    heroGradient: ['#1B5E20', '#388E3C', '#A5D6A7'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 0.75,
    mood: 'natural',
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    tagline: 'Corporate & precis - pour les operations B2B',
    primary: '#1E40AF',
    secondary: '#3B82F6',
    accent: '#93C5FD',
    heroGradient: ['#1E3A8A', '#2563EB', '#60A5FA'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 0.5,
    mood: 'corporate',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    tagline: 'Chaud & energique - taille pour les coursiers',
    primary: '#C2410C',
    secondary: '#F97316',
    accent: '#FDBA74',
    heroGradient: ['#9A3412', '#EA580C', '#FDBA74'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1.25,
    mood: 'warm',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Dark mode premium - editorial et sleek',
    primary: '#A78BFA',
    secondary: '#7C3AED',
    accent: '#F0ABFC',
    heroGradient: ['#0B0E1A', '#312E81', '#A78BFA'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1,
    mood: 'dark',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    tagline: 'Doux & accessible - parfait pour le B2C',
    primary: '#EC4899',
    secondary: '#A855F7',
    accent: '#F0ABFC',
    heroGradient: ['#DB2777', '#C026D3', '#F472B6'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1.5,
    mood: 'minimal',
  },
];

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

interface SkinTokens {
  id: string;
  name: string;
  tagline: string;
  primary: string;
  secondary: string;
  accent: string;
  heroGradient: [string, string, string];
  fontBody: string;
  fontHeading: string;
  radius: number;
  mood: string;
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

interface ThemeTokens {
  id: string;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  accent: string;
  mood: string;
}

/**
 * Catalogue statique des themes (palettes) -- DOIT rester aligne avec
 * packages/skins/src/themes.ts (BUILTIN_THEMES). 8 palettes preset
 * independantes du skin (layout).
 */
const THEME_CATALOG: ThemeTokens[] = [
  { id: 'emerald', name: 'Emeraude', description: 'Vert naturel, logistique mainstream', primary: '#1B5E20', secondary: '#4CAF50', accent: '#A5D6A7', mood: 'natural' },
  { id: 'sapphire', name: 'Saphir', description: 'Bleu corporate, B2B / finance', primary: '#1E40AF', secondary: '#3B82F6', accent: '#93C5FD', mood: 'corporate' },
  { id: 'amber', name: 'Ambre', description: 'Orange chaleureux, B2C grand public', primary: '#C2410C', secondary: '#F97316', accent: '#FDBA74', mood: 'warm' },
  { id: 'midnight', name: 'Minuit', description: 'Violet profond, dark editorial', primary: '#A78BFA', secondary: '#7C3AED', accent: '#F0ABFC', mood: 'dark' },
  { id: 'rose', name: 'Rose', description: 'Pastel doux, B2C niche', primary: '#EC4899', secondary: '#A855F7', accent: '#F0ABFC', mood: 'minimal' },
  { id: 'ocean', name: 'Ocean', description: 'Teal frais, SaaS / data', primary: '#0F766E', secondary: '#14B8A6', accent: '#5EEAD4', mood: 'ocean' },
  { id: 'royal', name: 'Royal', description: 'Indigo + or, premium institutionnel', primary: '#312E81', secondary: '#6366F1', accent: '#FBBF24', mood: 'royal' },
  { id: 'graphite', name: 'Graphite', description: 'Gris monochrome, ultra-minimal', primary: '#1F2937', secondary: '#4B5563', accent: '#9CA3AF', mood: 'minimal' },
];

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

const FONT_OPTIONS = [
  { value: 'Geist, system-ui, sans-serif', label: 'Geist' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: '"Plus Jakarta Sans", system-ui, sans-serif', label: 'Plus Jakarta Sans' },
  { value: '"DM Sans", system-ui, sans-serif', label: 'DM Sans' },
  { value: 'Manrope, system-ui, sans-serif', label: 'Manrope' },
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
    mut.mutate({
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      accentColor: form.accentColor,
      logoUrl: form.logoUrl,
      enabledModules: form.enabledModules,
      pinnedVersion: form.pinnedVersion,
      autoUpdatePolicy: form.autoUpdatePolicy,
      customDomain: form.customDomain,
      skinId: form.skinId,
      themeId: form.themeId,
      skinCustomization: form.skinCustomization,
    });
  }

  function enableAllModules() {
    setForm((f) => ({ ...f, enabledModules: KNOWN_MODULES.map((m) => m.code) }));
  }

  function disableAllModules() {
    setForm((f) => ({ ...f, enabledModules: [] }));
  }

  function patchSkin<K extends keyof SkinCustomization>(key: K, value: SkinCustomization[K]) {
    setForm((f) => ({
      ...f,
      skinCustomization: { ...(f.skinCustomization ?? {}), [key]: value },
    }));
  }

  // Catalogue de peaux statique - voir SKIN_CATALOG en haut du fichier.
  const skins = { data: SKIN_CATALOG };

  const selectedSkin = useMemo(
    () => skins.data.find((s) => s.id === form.skinId) ?? null,
    [form.skinId, skins.data],
  );

  const modulesByGroup = useMemo(() => {
    const groups: Record<string, typeof KNOWN_MODULES> = {};
    for (const m of KNOWN_MODULES) {
      (groups[m.group] ??= []).push(m);
    }
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      {/* Theming */}
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Palette className="h-3.5 w-3.5" /> Theme et identite visuelle
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <ColorField
            label="Couleur primaire"
            value={form.primaryColor}
            onChange={(v) => update('primaryColor', v)}
            placeholder="#1B5E20"
          />
          <ColorField
            label="Couleur secondaire"
            value={form.secondaryColor}
            onChange={(v) => update('secondaryColor', v)}
            placeholder="#4CAF50"
          />
          <ColorField
            label="Couleur accent"
            value={form.accentColor}
            onChange={(v) => update('accentColor', v)}
            placeholder="#E8F5E9"
          />
        </div>

        <Field label="Logo (PNG, JPG, SVG - max 5 MB)">
          <LogoFileField
            value={form.logoUrl}
            onChange={(url) => update('logoUrl', url)}
            onUpload={async (file) => {
              const res = await api.post<{ data: { url: string } }>(
                `/tenants/${tenantId}/logo`,
                file,
                { headers: { 'Content-Type': file.type } },
              );
              return res.data.data.url;
            }}
          />
        </Field>

        <div className="mt-4 rounded-md border bg-gray-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Apercu</p>
          <div className="mt-2 flex items-center gap-2">
            {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((k) => (
              <div
                key={k}
                className="flex h-10 w-20 items-center justify-center rounded border text-[10px] font-mono shadow-sm"
                style={{
                  background: form[k] ?? '#fff',
                  color: form[k] && isDark(form[k]!) ? '#fff' : '#111',
                }}
              >
                {form[k] ?? '-'}
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {/* Theme (palette de couleurs) -- independant du skin/layout */}
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Palette className="h-3.5 w-3.5" /> Theme (palette de couleurs)
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          La palette s&apos;applique partout : site public, dashboard staff, mails.
          Independante du skin (layout).
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => update('themeId', null)}
            className={
              'flex flex-col overflow-hidden rounded-lg border text-left transition ' +
              (!form.themeId
                ? 'border-primary-400 ring-2 ring-primary-200'
                : 'border-gray-200 hover:border-gray-300')
            }
          >
            <div className="h-12 w-full bg-gradient-to-br from-gray-200 to-gray-100" />
            <div className="flex-1 p-2">
              <p className="text-xs font-semibold">Aucun</p>
              <p className="line-clamp-2 text-[11px] text-gray-500">
                Palette par defaut du skin selectionne.
              </p>
            </div>
          </button>
          {THEME_CATALOG.map((t) => {
            const active = t.id === form.themeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => update('themeId', t.id)}
                className={
                  'flex flex-col overflow-hidden rounded-lg border text-left transition ' +
                  (active
                    ? 'border-primary-400 ring-2 ring-primary-200'
                    : 'border-gray-200 hover:border-gray-300')
                }
              >
                <div
                  className="h-12 w-full"
                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary} 60%, ${t.accent})` }}
                />
                <div className="flex-1 p-2">
                  <p className="text-xs font-semibold">{t.name}</p>
                  <p className="line-clamp-2 text-[11px] text-gray-500">{t.description}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                    {t.mood}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Skin / layout du site public */}
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Palette className="h-3.5 w-3.5" /> Peau (layout du site public)
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          La peau definit la composition du site web : disposition, format,
          presence/absence de sections. Le theme (couleurs) reste applique.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => update('skinId', null)}
            className={
              'flex flex-col overflow-hidden rounded-lg border text-left transition ' +
              (!form.skinId
                ? 'border-primary-400 ring-2 ring-primary-200'
                : 'border-gray-200 hover:border-gray-300')
            }
          >
            <div className="h-12 w-full bg-gradient-to-br from-gray-200 to-gray-100" />
            <div className="flex-1 p-2">
              <p className="text-xs font-semibold">Aucune</p>
              <p className="line-clamp-2 text-[11px] text-gray-500">
                Utilise uniquement les 3 couleurs ci-dessus.
              </p>
            </div>
          </button>
          {skins.data.map((s) => {
            const active = s.id === form.skinId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => update('skinId', s.id)}
                className={
                  'group flex flex-col overflow-hidden rounded-lg border text-left transition ' +
                  (active
                    ? 'border-primary-400 ring-2 ring-primary-200'
                    : 'border-gray-200 hover:border-gray-300')
                }
              >
                <div
                  className="h-12 w-full"
                  style={{
                    background: `linear-gradient(135deg, ${s.heroGradient[0]}, ${s.heroGradient[1]} 50%, ${s.heroGradient[2]})`,
                  }}
                />
                <div className="flex-1 p-2">
                  <p className="text-xs font-semibold">{s.name}</p>
                  <p className="line-clamp-2 text-[11px] text-gray-500">{s.tagline}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                    {s.mood}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Fonts + radius override */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Police - corps de texte">
            <select
              value={form.skinCustomization?.fontBody ?? selectedSkin?.fontBody ?? ''}
              onChange={(e) => patchSkin('fontBody', e.target.value || undefined)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">{selectedSkin ? `(skin) ${selectedSkin.fontBody}` : 'Defaut'}</option>
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Police - titres">
            <select
              value={form.skinCustomization?.fontHeading ?? selectedSkin?.fontHeading ?? ''}
              onChange={(e) => patchSkin('fontHeading', e.target.value || undefined)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">
                {selectedSkin ? `(skin) ${selectedSkin.fontHeading}` : 'Defaut'}
              </option>
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Rayon des coins"
            hint={`${(form.skinCustomization?.radius ?? selectedSkin?.radius ?? 0.5).toFixed(2)} rem`}
          >
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={form.skinCustomization?.radius ?? selectedSkin?.radius ?? 0.5}
              onChange={(e) => patchSkin('radius', Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        {(form.skinCustomization?.fontBody ||
          form.skinCustomization?.fontHeading ||
          form.skinCustomization?.radius !== undefined) && (
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                skinCustomization: {
                  ...f.skinCustomization,
                  fontBody: undefined,
                  fontHeading: undefined,
                  radius: undefined,
                },
              }))
            }
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500 underline hover:text-gray-700"
          >
            <TypeIcon className="h-3 w-3" /> Reinitialiser les overrides typo/radius
          </button>
        )}
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
          Vue en lecture seule. Pour modifier le theme ou les modules, contactez votre administrateur.
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

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
}) {
  const hex = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border bg-white"
        />
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={placeholder}
          className="flex-1 rounded-md border px-3 py-2 font-mono text-xs"
        />
      </div>
    </Field>
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

/**
 * Champ d'upload de logo. Le fichier BRUT (binaire) est relaye a l'orchestrator
 * (`onUpload`), qui le pousse a l'API du tenant -> stocke dans le bucket public
 * MinIO. Aucun encodage base64. La valeur finale (`value`/`onChange`) est l'URL
 * publique directe, IDENTIQUE a celle produite par la page Personnalisation du
 * tenant -> logo unifie entre ops-admin et dashboard tenant.
 */
function LogoFileField({
  value,
  onChange,
  onUpload,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Relaie le fichier brut et renvoie l'URL publique stockable. */
  onUpload: (file: File) => Promise<string>;
}) {
  const inputId = 'tenant-logo-upload';
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (!/^image\//.test(file.type)) {
      setError('Format non supporte (image attendue).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 5 Mo).');
      return;
    }
    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          "Echec de l'upload (le tenant doit etre provisionne et en ligne).",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Logo"
            className="h-16 w-16 rounded border bg-white object-contain p-1 shadow-sm"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
            }}
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed bg-gray-50 text-[10px] text-gray-400">
            Aucun
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={inputId}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50 ${
              uploading ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Envoi...
              </>
            ) : value ? (
              'Remplacer'
            ) : (
              'Choisir un fichier'
            )}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-gray-500 underline hover:text-red-600"
            >
              Retirer
            </button>
          )}
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // permet de re-uploader le meme fichier apres erreur
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function isDark(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l < 0.55;
}

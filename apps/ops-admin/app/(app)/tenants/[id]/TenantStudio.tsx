'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Palette, Save } from 'lucide-react';
import { api } from '@/lib/api';

interface StudioInput {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  enabledModules: string[];
  pinnedVersion: string | null;
  autoUpdatePolicy: string | null;
  customDomain: string | null;
}

interface Props {
  tenantId: string;
  initial: StudioInput;
}

const KNOWN_MODULES = [
  { code: 'core', label: 'Core (parcels, clients, agencies)' },
  { code: 'payments', label: 'Paiements en ligne' },
  { code: 'stock', label: 'Magasin/Stock' },
  { code: 'inventory', label: 'Inventaire' },
  { code: 'debts', label: 'Dette client' },
  { code: 'storage', label: 'Stockage/entreposage' },
  { code: 'web-client', label: 'Portail client public' },
  { code: 'mobile', label: 'App mobile white-label' },
];

const AUTO_UPDATE_POLICIES = [
  { value: 'MANUAL', label: 'Manuel (admin doit declencher)' },
  { value: 'AUTO_CRITICAL_ONLY', label: 'Auto critique uniquement (security/patch)' },
  { value: 'AUTO_STABLE', label: 'Auto-stable (toutes les releases stables)' },
];

export function TenantStudio({ tenantId, initial }: Props) {
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
    });
  }

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

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
          <Field label="URL du logo">
            <input
              type="url"
              value={form.logoUrl ?? ''}
              onChange={(e) => update('logoUrl', e.target.value || null)}
              placeholder="https://cdn.exemple.com/logo.png"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
          {form.logoUrl && (
            <div className="flex items-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl}
                alt="Logo"
                className="h-12 w-auto rounded border bg-white p-1 shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                }}
              />
            </div>
          )}
        </div>

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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Modules actives
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Cochez les modules disponibles pour ce tenant. Le frontend du tenant masque les sections desactivees.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {KNOWN_MODULES.map((m) => {
            const on = form.enabledModules.includes(m.code);
            return (
              <label
                key={m.code}
                className={
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ' +
                  (on ? 'border-primary-300 bg-primary-50' : 'bg-white hover:bg-gray-50')
                }
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleModule(m.code)}
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

      {/* Domain + update policy */}
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
          <input
            type="text"
            value={form.pinnedVersion ?? ''}
            onChange={(e) => update('pinnedVersion', e.target.value || null)}
            placeholder="ex: beta-1.0.34"
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          />
        </Field>
      </div>

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

function isDark(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l < 0.55;
}

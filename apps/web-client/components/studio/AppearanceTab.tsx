'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Check,
  Loader2,
  Monitor,
  Paintbrush,
  RotateCcw,
  Save,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSkin } from '@/lib/providers/SkinProvider';
import type { SkinId } from '@transitsoftservices/skins';

const FONTS = [
  'Geist, system-ui, sans-serif',
  'Inter, system-ui, sans-serif',
  '"Plus Jakarta Sans", system-ui, sans-serif',
  '"DM Sans", system-ui, sans-serif',
  'Manrope, system-ui, sans-serif',
];

export function AppearanceTab() {
  const skin = useSkin();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);

  const handlePublish = async () => {
    setSaving(true);
    await skin.publish();
    setSaving(false);
    toast.success('Theme publie pour ce tenant.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-6 lg:grid-cols-[360px_1fr]"
    >
      <aside className="space-y-6">
        <Panel title="Peau">
          <div className="grid grid-cols-2 gap-2">
            {skin.available.map((s) => (
              <SkinCard
                key={s.id}
                id={s.id}
                name={s.name}
                tagline={s.tagline}
                gradient={[s.heroGradient[0], s.heroGradient[2]]}
                active={skin.skinId === s.id}
                onSelect={() => skin.setSkin(s.id)}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Couleurs">
          <ColorRow
            label="Couleur principale"
            value={skin.resolved.primary}
            onChange={(v) => skin.patchCustomization({ primary: v })}
          />
          <ColorRow
            label="Couleur d'accent"
            value={skin.resolved.accent}
            onChange={(v) => skin.patchCustomization({ accent: v })}
          />
        </Panel>

        <Panel title="Typographie">
          <SelectRow
            label="Police du corps"
            value={skin.resolved.fontBody}
            options={FONTS}
            onChange={(v) => skin.patchCustomization({ fontBody: v })}
          />
          <SelectRow
            label="Police des titres"
            value={skin.resolved.fontHeading}
            options={FONTS}
            onChange={(v) => skin.patchCustomization({ fontHeading: v })}
          />
        </Panel>

        <Panel title="Arrondis">
          <RangeRow
            label={`Rayon : ${skin.resolved.radius.toFixed(2)} rem`}
            value={skin.resolved.radius}
            min={0}
            max={2.5}
            step={0.05}
            onChange={(v) => skin.patchCustomization({ radius: v })}
          />
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={skin.resetCustomization}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold skin-btn-ghost"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold skin-btn-primary"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Publier
          </button>
        </div>
      </aside>

      <section className="relative">
        <div className="mb-3 flex justify-end">
          <div
            className="inline-flex skin-radius border"
            style={{ borderColor: 'var(--skin-border)' }}
          >
            {(['desktop', 'mobile'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className="inline-flex h-9 w-9 items-center justify-center text-sm font-semibold"
                style={{
                  color:
                    device === d ? 'var(--skin-primary)' : 'var(--skin-muted)',
                  background:
                    device === d
                      ? 'color-mix(in oklab, var(--skin-primary) 12%, transparent)'
                      : 'transparent',
                }}
                aria-label={d}
              >
                {d === 'desktop' ? (
                  <Monitor className="h-4 w-4" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div
          className="overflow-hidden skin-radius-lg skin-shadow"
          style={{
            background: 'var(--skin-surface)',
            border: '1px solid var(--skin-border)',
          }}
        >
          <div
            className="flex items-center gap-2 border-b px-4 py-2 text-xs"
            style={{
              background: 'var(--skin-background)',
              borderColor: 'var(--skin-border)',
              color: 'var(--skin-muted)',
            }}
          >
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="ml-2 truncate">
              www.&lt;votre-tenant&gt;.transitsoftservices.com
            </span>
          </div>
          <div
            className={
              'transition-all ' +
              (device === 'mobile' ? 'mx-auto max-w-sm' : 'w-full')
            }
          >
            <iframe
              key={`${skin.skinId}-${skin.resolved.primary}-${skin.resolved.radius}-${skin.resolved.accent}`}
              title="Apercu du site"
              src="/?preview=1"
              className="h-[720px] w-full border-0"
            />
          </div>
        </div>
        <p
          className="mt-3 inline-flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--skin-muted)' }}
        >
          <Paintbrush className="h-3.5 w-3.5" /> Les changements sont instantanes
          dans l'apercu. Publiez pour les rendre visibles a vos visiteurs.
        </p>
      </section>
    </motion.div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5 skin-card">
      <h2
        className="text-xs font-bold uppercase tracking-[0.2em]"
        style={{ color: 'var(--skin-primary)' }}
      >
        {title}
      </h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function SkinCard({
  id,
  name,
  tagline,
  gradient,
  active,
  onSelect,
}: {
  id: SkinId;
  name: string;
  tagline: string;
  gradient: [string, string];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative overflow-hidden p-3 text-left skin-radius transition-transform hover:-translate-y-0.5"
      style={{
        background: 'var(--skin-surface)',
        border: `1px solid ${active ? 'var(--skin-primary)' : 'var(--skin-border)'}`,
      }}
    >
      <span
        className="block h-14 w-full skin-radius-sm"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        }}
      />
      <p
        className="mt-2 text-sm font-semibold skin-font-heading"
        style={{ color: 'var(--skin-foreground)' }}
      >
        {name}
      </p>
      <p className="text-[10px]" style={{ color: 'var(--skin-muted)' }}>
        {tagline}
      </p>
      {active && (
        <span
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ background: 'var(--skin-primary)' }}
        >
          <Check className="h-3 w-3" />
        </span>
      )}
      <span className="sr-only">{id}</span>
    </button>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="skin-input"
          style={{ width: 96, padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-md border"
          style={{
            borderColor: 'var(--skin-border)',
            background: 'transparent',
          }}
        />
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="skin-input"
        style={{ width: 200, padding: '0.4rem 0.5rem', fontSize: '0.8rem' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.split(',')[0].replaceAll('"', '')}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-current"
      />
    </div>
  );
}

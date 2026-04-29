'use client';

import { useEffect, useState } from 'react';
import { Save, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { useTenantMeta } from '@/lib/providers/TenantProvider';
import { organizationApi } from '@/lib/api/organization';
import { generatePalette } from '@/lib/theme/palette-generator';
import { toast } from 'sonner';

const DEFAULT_PRIMARY = '#1B5E20';
const DEFAULT_SECONDARY = '#4CAF50';
const DEFAULT_ACCENT = '#E8F5E9';

const SWATCHES = [
  { label: 'Vert (defaut)', primary: '#1B5E20', secondary: '#4CAF50', accent: '#E8F5E9' },
  { label: 'Bleu', primary: '#0D47A1', secondary: '#2196F3', accent: '#E3F2FD' },
  { label: 'Violet', primary: '#4A148C', secondary: '#9C27B0', accent: '#F3E5F5' },
  { label: 'Rouge', primary: '#B71C1C', secondary: '#F44336', accent: '#FFEBEE' },
  { label: 'Orange', primary: '#E65100', secondary: '#FF9800', accent: '#FFF3E0' },
  { label: 'Bleu nuit', primary: '#1A237E', secondary: '#3F51B5', accent: '#E8EAF6' },
];

export default function BrandingSettingsPage() {
  const { meta, refresh } = useTenantMeta();
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [supportEmail, setSupportEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meta) {
      setName(meta.name);
      setPrimaryColor(meta.primaryColor);
      setSecondaryColor(meta.secondaryColor);
      setAccentColor(meta.accentColor);
      setLogoUrl(meta.logoUrl ?? '');
      setSupportEmail(meta.supportEmail ?? '');
    }
  }, [meta]);

  const previewPalette = generatePalette(primaryColor);

  const handleSwatch = (s: typeof SWATCHES[number]) => {
    setPrimaryColor(s.primary);
    setSecondaryColor(s.secondary);
    setAccentColor(s.accent);
  };

  const handleReset = () => {
    setPrimaryColor(DEFAULT_PRIMARY);
    setSecondaryColor(DEFAULT_SECONDARY);
    setAccentColor(DEFAULT_ACCENT);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await organizationApi.updateBranding({
        name,
        logoUrl: logoUrl || null,
        primaryColor,
        secondaryColor,
        accentColor,
        supportEmail: supportEmail || null,
      });
      await refresh();
      toast.success('Personnalisation enregistree');
    } catch (e: { response?: { data?: { message?: string } } } | unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Erreur lors de l\'enregistrement';
      toast.error(msg);
    }
    setSaving(false);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personnalisation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Modifiez le nom, le logo et les couleurs de votre tenant. Les changements sont visibles
            immediatement apres enregistrement.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            <AppCard>
              <AppCardHeader title="Identite" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AppInput label="Nom de l'organisation" value={name} onChange={(e) => setName(e.target.value)} />
                <AppInput label="Email de support" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@..." />
                <AppInput
                  label="URL du logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="sm:col-span-2"
                />
              </div>
              {logoUrl && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  <img src={logoUrl} alt="Logo preview" className="h-10 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                  <span className="text-xs text-gray-500 truncate">{logoUrl}</span>
                </div>
              )}
            </AppCard>

            <AppCard>
              <AppCardHeader title="Couleurs" />
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Themes predefinis</p>
                  <div className="flex flex-wrap gap-2">
                    {SWATCHES.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => handleSwatch(s)}
                        className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs hover:border-primary-500 hover:bg-primary-50 transition-colors"
                      >
                        <span className="flex">
                          <span className="h-4 w-4 rounded-l border border-white" style={{ backgroundColor: s.primary }} />
                          <span className="h-4 w-4 border-y border-white" style={{ backgroundColor: s.secondary }} />
                          <span className="h-4 w-4 rounded-r border border-white" style={{ backgroundColor: s.accent }} />
                        </span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <ColorField label="Primary (couleur dominante)" value={primaryColor} onChange={setPrimaryColor} />
                  <ColorField label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
                  <ColorField label="Accent (fond clair)" value={accentColor} onChange={setAccentColor} />
                </div>
              </div>
            </AppCard>
          </div>

          {/* Preview */}
          <div className="lg:col-span-1">
            <AppCard>
              <AppCardHeader title="Apercu" />
              <div className="space-y-3">
                {/* Mini sidebar preview */}
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: previewPalette[900], color: 'white' }}
                >
                  <p className="font-semibold">{name || 'Mon entreprise'}</p>
                  <p className="text-xs opacity-80">Sidebar</p>
                </div>

                {/* Buttons */}
                <button
                  type="button"
                  className="w-full rounded-xl px-4 py-2 text-white text-sm font-medium"
                  style={{ backgroundColor: previewPalette[500] }}
                >
                  Bouton principal
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-4 py-2 text-sm font-medium"
                  style={{ backgroundColor: accentColor, color: previewPalette[900] }}
                >
                  Bouton accent
                </button>

                {/* Palette generee */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Palette generee</p>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.entries(previewPalette).map(([k, hex]) => (
                      <div
                        key={k}
                        className="rounded-md p-1 text-[9px] font-mono"
                        style={{
                          backgroundColor: hex,
                          color: Number(k) > 400 ? 'white' : '#000',
                        }}
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AppCard>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
            Reinitialiser couleurs
          </AppButton>
          <AppButton onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" />
            Enregistrer
          </AppButton>
        </div>
      </div>
    </PageTransition>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-gray-200 px-3 text-sm font-mono uppercase"
          placeholder="#XXXXXX"
        />
      </div>
    </div>
  );
}

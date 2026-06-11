import { useState } from 'react';
import { Package, RefreshCw, MoreHorizontal, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppCheckbox } from '@/components/ui/AppCheckbox';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { AppTabs } from '@/components/ui/AppTabs';
import { AppProgress } from '@/components/ui/AppProgress';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppTooltip } from '@/components/ui/AppTooltip';
import { AppDropdownMenu } from '@/components/ui/AppDropdownMenu';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppDatePicker } from '@/components/ui/AppDatePicker';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { AppDataTable, type Column } from '@/components/ui/AppDataTable';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

// Galerie temoin (Etape 2) : rend les composants ui/ portes verbatim pour
// valider la parite visuelle. Accessible a /gallery (hors chrome dashboard).

type Row = { id: number; client: string; statut: string; montant: string };
const ROWS: Row[] = [
  { id: 1, client: 'Awa Diallo', statut: 'Payé', montant: '120 000 XAF' },
  { id: 2, client: 'Jean Mbarga', statut: 'En attente', montant: '85 500 XAF' },
  { id: 3, client: 'Sékou Touré', statut: 'Annulé', montant: '0 XAF' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'client', label: 'Client' },
  {
    key: 'statut',
    label: 'Statut',
    render: (r) => (
      <AppBadge variant={r.statut === 'Payé' ? 'success' : r.statut === 'Annulé' ? 'error' : 'warning'}>
        {r.statut}
      </AppBadge>
    ),
  },
  { key: 'montant', label: 'Montant' },
];

function GSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function Gallery() {
  const { meta, loading, refresh } = useTenantMeta();
  const [checked, setChecked] = useState(true);
  const [active, setActive] = useState(false);
  const [select, setSelect] = useState('air');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b bg-sidebar-bg text-sidebar-text">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Package className="size-6" />
            <h1 className="text-lg font-semibold">{meta?.name ?? 'Chargement…'} — Galerie ui/</h1>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refresh()}
            disabled={loading}
            className="text-sidebar-text hover:bg-white/15 hover:text-sidebar-text"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Recharger thème
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        <GSection title="AppButton — variantes / tailles / loading">
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="primary">Primaire</AppButton>
            <AppButton variant="secondary">Secondaire</AppButton>
            <AppButton variant="outline">Contour</AppButton>
            <AppButton variant="ghost">Ghost</AppButton>
            <AppButton variant="destructive">Supprimer</AppButton>
            <AppButton size="sm">sm</AppButton>
            <AppButton size="lg">lg</AppButton>
            <AppButton loading>Chargement</AppButton>
          </div>
        </GSection>

        <GSection title="AppBadge">
          <div className="flex flex-wrap items-center gap-2">
            {(['default', 'success', 'warning', 'error', 'info', 'outline'] as const).map((v) => (
              <AppBadge key={v} variant={v}>{v}</AppBadge>
            ))}
          </div>
        </GSection>

        <GSection title="AppCard">
          <AppCard>
            <AppCardHeader
              title="Carte exemple"
              description="En-tête avec action"
              action={<AppButton size="sm" variant="outline">Action</AppButton>}
            />
            <p className="text-sm text-muted-foreground">Contenu de carte.</p>
          </AppCard>
        </GSection>

        <GSection title="Champs — Input / Textarea / Select / DatePicker / Phone">
          <div className="grid gap-4 sm:grid-cols-2">
            <AppInput label="Nom" placeholder="Saisir…" />
            <AppSelect
              label="Mode"
              value={select}
              onValueChange={setSelect}
              options={[
                { value: 'air', label: 'Aérien' },
                { value: 'sea', label: 'Maritime' },
                { value: 'road', label: 'Terrestre' },
              ]}
            />
            <AppDatePicker label="Date" />
            <AppPhoneInput label="Téléphone" value={undefined} onChange={() => {}} />
            <AppTextarea label="Note" placeholder="Commentaire…" className="sm:col-span-2" />
          </div>
        </GSection>

        <GSection title="Toggles — Checkbox / Switch">
          <div className="flex flex-wrap items-center gap-6">
            <AppCheckbox checked={checked} onCheckedChange={setChecked} label="J'accepte" />
            <AppSwitch checked={active} onCheckedChange={setActive} label="Notifications" />
          </div>
        </GSection>

        <GSection title="AppTabs">
          <AppTabs
            tabs={[
              { value: 'a', label: 'Détails', content: <p className="text-sm text-muted-foreground pt-3">Onglet détails.</p> },
              { value: 'b', label: 'Historique', content: <p className="text-sm text-muted-foreground pt-3">Onglet historique.</p> },
            ]}
          />
        </GSection>

        <GSection title="AppProgress">
          <div className="space-y-3 max-w-md">
            <AppProgress value={30} label="30%" showValue />
            <AppProgress value={65} label="65%" showValue />
            <AppProgress value={90} label="90%" showValue />
          </div>
        </GSection>

        <GSection title="Avatar / Tooltip / Dropdown / Toast / Dialog">
          <div className="flex flex-wrap items-center gap-4">
            <AppAvatar fallback="AD" size="lg" />
            <AppTooltip content="Infobulle">
              <AppButton variant="outline">Survol</AppButton>
            </AppTooltip>
            <AppDropdownMenu
              trigger={<AppButton variant="outline"><MoreHorizontal /> Menu</AppButton>}
              items={[
                { label: 'Éditer', icon: <Pencil className="size-4" />, onClick: () => toast('Éditer') },
                { label: 'Supprimer', icon: <Trash2 className="size-4" />, variant: 'destructive', onClick: () => toast.error('Supprimé') },
              ]}
            />
            <AppButton onClick={() => toast.success('Toast déclenché')}>Toast</AppButton>
            <AppButton variant="secondary" onClick={() => setDialogOpen(true)}>Ouvrir dialog</AppButton>
          </div>
        </GSection>

        <GSection title="AppDataTable">
          <AppDataTable columns={COLUMNS} data={ROWS} total={ROWS.length} page={1} totalPages={1} />
        </GSection>

        <GSection title="AppSkeleton">
          <div className="space-y-2 max-w-md">
            <AppSkeleton className="h-4 w-3/4" />
            <AppSkeleton className="h-4 w-1/2" />
            <AppSkeleton className="h-4 w-2/3" />
          </div>
        </GSection>

        <GSection title="Palette primaire — générée runtime depuis le thème tenant">
          <div className="flex flex-wrap items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => (
              <div key={shade} className="text-center">
                <div className="size-12 rounded-lg border" style={{ backgroundColor: `var(--color-primary-${shade})` }} />
                <span className="text-[10px] text-muted-foreground">{shade}</span>
              </div>
            ))}
          </div>
        </GSection>
      </main>

      <AppDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Dialog exemple"
        description="Composant AppDialog porté verbatim."
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="outline" onClick={() => setDialogOpen(false)}>Annuler</AppButton>
            <AppButton onClick={() => setDialogOpen(false)}>Confirmer</AppButton>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">Corps du dialog.</p>
      </AppDialog>
    </div>
  );
}

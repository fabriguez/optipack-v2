'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Bell,
  Camera,
  ChevronRight,
  Gift,
  Handshake,
  Loader2,
  Lock,
  LogOut,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  portalApi,
  type ClientProfile,
  type NotificationChannel,
  type NotificationPrefs,
} from '@/lib/api/client';
import { useLogout } from '@/lib/hooks/useAuth';
import { Field } from '@/components/auth/Field';
import { AuthedImage } from '@/components/ui/AuthedImage';

// Evenements notifiables cote client (memes cles que l'API).
const EVENT_KINDS = [
  'PARCEL_CREATED',
  'PARCEL_ARRIVED',
  'PARCEL_DELIVERED',
  'PAYMENT_RECEIVED',
  'PENALTY_APPLIED',
];

// Canaux externes pilotables par le client. IN_APP reste toujours actif
// (fil de notifications dans le portail) et n'est pas expose en toggle.
const TOGGLE_CHANNELS: Array<{ key: NotificationChannel; label: string }> = [
  { key: 'EMAIL', label: 'Notifications Email' },
  { key: 'SMS', label: 'Notifications SMS' },
  { key: 'PUSH', label: 'Notifications Push' },
];

export default function ProfilePage() {
  const logout = useLogout();
  const { data: me, isLoading } = useQuery<ClientProfile>({
    queryKey: ['portal', 'me'],
    queryFn: () => portalApi.getMe(),
    // Pas de socket cote web-client : on capte les changements (fidelite,
    // promotion partenaire) au focus et via un polling leger.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1
          className="text-3xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Mon profil
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Vos informations personnelles et preferences.
        </p>
      </motion.div>

      {isLoading || !me ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--skin-primary)' }} />
        </div>
      ) : (
        <>
          <InfoCard me={me} />
          <LoyaltyCard me={me} />
          <NotificationsCard me={me} />
          <SecurityCard />

          <button
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-ghost"
            onClick={logout}
            style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.4)' }}
          >
            <LogOut className="h-4 w-4" />
            Se deconnecter
          </button>
        </>
      )}
    </div>
  );
}

// ── Informations + avatar ──────────────────────────────────

function InfoCard({ me }: { me: ClientProfile }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(me.fullName);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [address, setAddress] = useState(me.address ?? '');

  useEffect(() => {
    setFullName(me.fullName);
    setPhone(me.phone ?? '');
    setAddress(me.address ?? '');
  }, [me.fullName, me.phone, me.address]);

  // Profil verrouille tant que la verification d'identite est validee.
  const locked = me.idVerificationStatus === 'APPROVED';

  const dirty =
    fullName.trim() !== me.fullName ||
    phone.trim() !== (me.phone ?? '') ||
    address.trim() !== (me.address ?? '');

  const save = useMutation({
    mutationFn: () =>
      portalApi.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
      toast.success('Profil mis a jour');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Echec de la mise a jour'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => portalApi.uploadAvatar(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
      toast.success('Photo mise a jour');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Echec de l'envoi de la photo"),
  });

  const initials = me.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card title="Informations" Icon={User}>
      <div className="flex items-center gap-4 pb-2">
        <div className="relative">
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-lg font-bold"
            style={{
              background: 'color-mix(in oklab, var(--skin-primary) 14%, transparent)',
              color: 'var(--skin-primary)',
            }}
          >
            <AuthedImage
              src={me.imageUrl}
              alt={me.fullName}
              className="h-full w-full object-cover"
              fallback={<>{initials}</>}
            />
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow"
            style={{ background: 'var(--skin-primary)', color: '#fff' }}
            aria-label="Changer la photo"
          >
            {upload.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--skin-foreground)' }}>
            {me.fullName}
          </p>
          <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
            JPG, PNG ou WEBP. Max 5 Mo.
          </p>
        </div>
      </div>

      {locked && (
        <div
          className="flex items-start gap-2 rounded-lg p-3 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 8%, transparent)',
            color: 'var(--skin-muted)',
          }}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--skin-primary)' }} />
          Identite verifiee : vos informations sont verrouillees jusqu&apos;a peremption du document.
        </div>
      )}

      <div className="grid gap-3 pt-1">
        <Field label="Nom complet">
          <input
            className="skin-input w-full"
            value={fullName}
            disabled={locked}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Telephone">
          <input
            className="skin-input w-full"
            value={phone}
            disabled={locked}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Adresse">
          <input
            className="skin-input w-full"
            value={address}
            disabled={locked}
            placeholder="Optionnel"
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="Email" hint="L'email n'est pas modifiable ici.">
          <input
            className="skin-input w-full"
            value={me.email ?? ''}
            disabled
            readOnly
          />
        </Field>
      </div>

      {!locked && (
        <div className="flex justify-end pt-2">
          <button
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-primary disabled:opacity-50"
            onClick={() => save.mutate()}
            disabled={!dirty || !fullName.trim() || !phone.trim() || save.isPending}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Fidelite + statut partenaire ───────────────────────────

const TIER_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  SILVER: 'Argent',
  GOLD: 'Or',
  VIP: 'VIP',
};

function LoyaltyCard({ me }: { me: ClientProfile }) {
  const tierLabel = TIER_LABEL[me.loyaltyTier ?? 'STANDARD'] ?? me.loyaltyTier;

  return (
    <Card title="Fidelite" Icon={Gift}>
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold skin-radius-sm"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
            color: 'var(--skin-primary)',
          }}
        >
          Palier {tierLabel}
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold skin-radius-sm"
          style={{
            background: me.isPartner
              ? 'color-mix(in oklab, var(--skin-primary) 12%, transparent)'
              : 'color-mix(in oklab, var(--skin-muted) 12%, transparent)',
            color: me.isPartner ? 'var(--skin-primary)' : 'var(--skin-muted)',
          }}
        >
          <Handshake className="h-3.5 w-3.5" />
          {me.isPartner ? 'Partenaire' : 'Non partenaire'}
        </div>
      </div>

      <div className="flex items-end justify-between pt-1">
        <div>
          <p
            className="text-3xl font-bold tracking-tight skin-font-heading"
            style={{ color: 'var(--skin-foreground)' }}
          >
            {me.loyaltyPoints}
          </p>
          <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
            Points de fidelite cumules
          </p>
        </div>
      </div>

      <Link
        href="/app/loyalty"
        className="mt-2 flex items-center justify-between gap-3 px-4 py-3 skin-radius transition-colors hover:bg-black/2"
        style={{ border: '1px solid var(--skin-border)' }}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Convertir mes points
        </span>
        <ChevronRight className="h-4 w-4" style={{ color: 'var(--skin-muted)' }} />
      </Link>
    </Card>
  );
}

// ── Preferences notification ───────────────────────────────

function NotificationsCard({ me }: { me: ClientProfile }) {
  const qc = useQueryClient();
  const initialPrefs = useMemo<NotificationPrefs>(
    () => me.notificationPrefs ?? {},
    [me.notificationPrefs],
  );

  // Un canal est "actif" s'il est autorise sur tous les events (defaut : tout
  // actif quand aucune preference n'est posee = opt-out).
  const isChannelOn = (prefs: NotificationPrefs, ch: NotificationChannel): boolean => {
    if (!prefs || Object.keys(prefs).length === 0) return true;
    return EVENT_KINDS.every((k) => {
      const channels = prefs[k]?.channels;
      if (!channels) return true;
      return channels.includes(ch);
    });
  };

  const [state, setState] = useState<Record<NotificationChannel, boolean>>({
    EMAIL: true,
    SMS: true,
    PUSH: true,
    IN_APP: true,
  });

  useEffect(() => {
    setState({
      EMAIL: isChannelOn(initialPrefs, 'EMAIL'),
      SMS: isChannelOn(initialPrefs, 'SMS'),
      PUSH: isChannelOn(initialPrefs, 'PUSH'),
      IN_APP: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrefs]);

  const save = useMutation({
    mutationFn: () => {
      // IN_APP toujours actif + canaux externes selon les toggles.
      const channels: NotificationChannel[] = ['IN_APP'];
      if (state.EMAIL) channels.push('EMAIL');
      if (state.SMS) channels.push('SMS');
      if (state.PUSH) channels.push('PUSH');
      const prefs: NotificationPrefs = {};
      for (const k of EVENT_KINDS) prefs[k] = { channels };
      return portalApi.updateNotificationPrefs(prefs);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
      toast.success('Preferences enregistrees');
    },
    onError: () => toast.error("Echec de l'enregistrement"),
  });

  return (
    <Card title="Notifications" Icon={Bell}>
      {TOGGLE_CHANNELS.map((c) => (
        <label key={c.key} className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm" style={{ color: 'var(--skin-foreground)' }}>
            {c.label}
          </span>
          <input
            type="checkbox"
            checked={state[c.key]}
            onChange={(e) => setState((s) => ({ ...s, [c.key]: e.target.checked }))}
            className="h-4 w-4 accent-current"
            style={{ accentColor: 'var(--skin-primary)' }}
          />
        </label>
      ))}
      <p className="pt-1 text-xs" style={{ color: 'var(--skin-muted)' }}>
        Les notifications dans l&apos;application restent toujours actives. SMS et Push dependent de
        la configuration du transporteur.
      </p>
      <div className="flex justify-end pt-2">
        <button
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-primary disabled:opacity-50"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>
    </Card>
  );
}

// ── Securite : changement de mot de passe ──────────────────

function SecurityCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const change = useMutation({
    mutationFn: () => portalApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Mot de passe change');
      setCurrent('');
      setNext('');
      setConfirmPwd('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const submit = () => {
    if (next !== confirmPwd) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (next.length < 6) {
      toast.error('Au moins 6 caracteres');
      return;
    }
    change.mutate();
  };

  return (
    <Card title="Securite" Icon={Lock}>
      <div className="grid gap-3">
        <Field label="Mot de passe actuel">
          <input
            type="password"
            className="skin-input w-full"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Nouveau mot de passe">
          <input
            type="password"
            className="skin-input w-full"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <input
            type="password"
            className="skin-input w-full"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end pt-2">
        <button
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-primary disabled:opacity-50"
          onClick={submit}
          disabled={!current || !next || !confirmPwd || change.isPending}
        >
          {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Changer le mot de passe
        </button>
      </div>
    </Card>
  );
}

// ── Primitives ─────────────────────────────────────────────

function Card({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="p-6 space-y-3 skin-card">
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center skin-radius"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
            color: 'var(--skin-primary)',
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <h2
          className="text-base font-semibold skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {title}
        </h2>
      </div>
      <div className="space-y-2 pt-1">{children}</div>
    </section>
  );
}

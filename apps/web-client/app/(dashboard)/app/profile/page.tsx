'use client';

import { motion } from 'framer-motion';
import { Bell, Lock, LogOut, Mail, Phone, User } from 'lucide-react';
import { useLogout } from '@/lib/hooks/useAuth';

export default function ProfilePage() {
  const logout = useLogout();

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

      <Card title="Informations" Icon={User}>
        <Row label="Nom complet" value="Charge depuis le compte" />
        <Row Icon={Phone} label="Telephone" value="Charge depuis le compte" />
        <Row Icon={Mail} label="Email" value="optionnel" />
      </Card>

      <Card title="Notifications" Icon={Bell}>
        <Toggle label="Notifications SMS" defaultOn />
        <Toggle label="Notifications Email" defaultOn />
        <Toggle label="Notifications Push" />
      </Card>

      <Card title="Securite" Icon={Lock}>
        <button className="text-sm font-semibold skin-btn-ghost px-4 py-2">
          Changer le mot de passe
        </button>
        <button
          className="ml-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold skin-btn-ghost"
          onClick={logout}
          style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.4)' }}
        >
          <LogOut className="h-4 w-4" />
          Se deconnecter
        </button>
      </Card>
    </div>
  );
}

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

function Row({
  Icon,
  label,
  value,
}: {
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--skin-border)' }}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" />}
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--skin-muted)' }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--skin-foreground)' }}
      >
        {value}
      </span>
    </div>
  );
}

function Toggle({ label, defaultOn }: { label: string; defaultOn?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm" style={{ color: 'var(--skin-foreground)' }}>
        {label}
      </span>
      <input type="checkbox" defaultChecked={defaultOn} className="h-4 w-4 accent-current" />
    </label>
  );
}

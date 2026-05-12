'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Health = 'ok' | 'down' | 'checking';

interface Component {
  key: string;
  label: string;
  desc: string;
  status: Health;
}

export default function StatusPage() {
  const [components, setComponents] = useState<Component[]>([
    { key: 'api', label: 'API publique', desc: 'Endpoint de tracking et auth.', status: 'checking' },
    { key: 'portal', label: 'Portail client', desc: 'Espace personnel et notifications.', status: 'checking' },
    { key: 'staff', label: 'Plateforme agence', desc: 'Outils interne des transitaires.', status: 'checking' },
  ]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const ping = async () => {
      // On ping l'endpoint /health public. Si OK, on considere tous les
      // services up (decoupage fin a faire si on expose un /status/components).
      try {
        await axios.get(`${API_URL}/health`, { timeout: 5000 });
        setComponents((cs) => cs.map((c) => ({ ...c, status: 'ok' as const })));
      } catch {
        setComponents((cs) => cs.map((c) => ({ ...c, status: 'down' as const })));
      }
      setCheckedAt(new Date());
    };
    ping();
    const id = setInterval(ping, 60_000); // refresh chaque minute
    return () => clearInterval(id);
  }, []);

  const allOk = components.every((c) => c.status === 'ok');
  const anyChecking = components.some((c) => c.status === 'checking');

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-8 text-center">
        <p
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Statut
        </p>
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {anyChecking
            ? 'Verification en cours...'
            : allOk
              ? 'Tous les services sont operationnels'
              : 'Incident en cours'}
        </h1>
        {checkedAt && (
          <p className="mt-2 text-xs" style={{ color: 'var(--skin-muted)' }}>
            Derniere verification : {checkedAt.toLocaleTimeString('fr-FR')}
          </p>
        )}
      </header>

      <ul className="space-y-3">
        {components.map((c) => (
          <li
            key={c.key}
            className="flex items-center justify-between rounded-2xl border p-4"
            style={{ borderColor: 'var(--skin-border)' }}
          >
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {c.label}
              </p>
              <p className="text-xs" style={{ color: 'var(--skin-muted)' }}>
                {c.desc}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs" style={{ color: 'var(--skin-muted)' }}>
        Cette page est mise a jour automatiquement chaque minute.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Health }) {
  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verification
      </span>
    );
  }
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Operationnel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
      <AlertCircle className="h-3 w-3" />
      Incident
    </span>
  );
}

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post('/auth/reset-password', { email, code, newPassword: password });
      toast.success('Mot de passe reinitialise. Vous pouvez vous connecter.');
      router.push('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <AppCard>
          <Link href="/login" className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-700">
            <ArrowLeft className="h-3 w-3" />
            Connexion
          </Link>
          <h1 className="text-xl font-bold">Nouveau mot de passe</h1>
          <p className="mt-1 text-sm text-gray-500">
            Saisissez le code recu par email puis votre nouveau mot de passe.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <AppInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <AppInput
              label="Code de verification"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              required
            />
            <AppInput
              label="Nouveau mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <AppInput
              label="Confirmer"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
            <AppButton
              type="submit"
              loading={busy}
              className="w-full"
              disabled={!email || code.length !== 6 || !password || !confirm}
            >
              Reinitialiser
            </AppButton>
            <Link
              href="/forgot-password"
              className="block text-center text-xs text-gray-500 hover:text-primary-700"
            >
              Renvoyer un code
            </Link>
          </form>
        </AppCard>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

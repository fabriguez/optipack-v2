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
  const token = params.get('token') ?? '';
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
      await apiClient.post('/auth/reset-password', { token, newPassword: password });
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
          {!token ? (
            <p className="mt-3 text-sm text-red-600">Lien invalide. Reessayez depuis l&apos;email recu.</p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <AppInput
                label="Nouveau mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <AppInput
                label="Confirmer"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
              <AppButton type="submit" loading={busy} className="w-full" disabled={!password || !confirm}>
                Reinitialiser
              </AppButton>
            </form>
          )}
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

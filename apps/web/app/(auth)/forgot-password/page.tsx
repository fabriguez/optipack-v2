'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      toast.success('Si le compte existe, un code a ete envoye par email.');
      // On passe a l'etape de saisie du code ; l'email est pre-rempli.
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
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
            Retour a la connexion
          </Link>
          <h1 className="text-xl font-bold">Mot de passe oublie</h1>
          <p className="mt-1 text-sm text-gray-500">
            Entrez votre email, nous vous enverrons un code de verification valable 10 minutes.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <AppInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <AppButton type="submit" loading={busy} className="w-full" disabled={!email}>
              Envoyer le code
            </AppButton>
          </form>
        </AppCard>
      </div>
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { clientPortalApi, setClientToken } from '@/lib/api/client-portal';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

export default function ClientPortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!phone || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    try {
      const res = await clientPortalApi.login(phone, password);
      setClientToken(res.data.token);
      router.replace('/portal/dashboard');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Identifiants incorrects. Veuillez reessayer.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-700">{orgName}</h1>
          <p className="mt-2 text-sm text-gray-500">
            Espace Client -- Suivez vos colis en temps reel
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-card">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">
            Connexion
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AppPhoneInput
              label="Numero de telephone"
              value={phone}
              onChange={(val) => setPhone(val || '')}
              defaultCountry="CM"
              placeholder="+237 6XX XXX XXX"
            />

            <AppInput
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
            />

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <AppButton
              type="submit"
              loading={loading}
              className="w-full"
            >
              Se connecter
            </AppButton>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Contactez votre agence pour obtenir vos identifiants.
        </p>
      </div>
    </div>
  );
}

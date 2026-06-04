'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { clientPortalApi } from '@/lib/api/client-portal';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

type Step = 'identifier' | 'code' | 'password';
type IdentifierMode = 'phone' | 'email';

export default function ClientPortalForgotPasswordPage() {
  const router = useRouter();
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';

  const [step, setStep] = useState<Step>('identifier');
  const [mode, setMode] = useState<IdentifierMode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const identifier = mode === 'phone' ? (phone || '').replace(/\s/g, '') : email.trim();

  // Etape 1 : demande du code OTP. Reponse generique (anti-enumeration).
  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!identifier) {
      setError('Veuillez renseigner votre email ou telephone.');
      return;
    }
    setLoading(true);
    try {
      await clientPortalApi.forgotPassword(identifier);
      setInfo('Si un compte existe, un code vous a ete envoye par email, SMS et WhatsApp.');
      setStep('code');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Une erreur est survenue. Reessayez.');
    } finally {
      setLoading(false);
    }
  }

  // Etape 2 : verifie le code sans le consommer.
  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Le code doit contenir 6 chiffres.');
      return;
    }
    setLoading(true);
    try {
      await clientPortalApi.verifyResetCode({ identifier, code });
      setInfo('');
      setStep('password');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Code invalide ou expire.');
    } finally {
      setLoading(false);
    }
  }

  // Etape 3 : applique le nouveau mot de passe.
  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await clientPortalApi.resetPassword({ identifier, code, newPassword: password });
      router.replace('/portal?reset=1');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Une erreur est survenue. Reessayez.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setLoading(true);
    try {
      await clientPortalApi.forgotPassword(identifier);
      setInfo('Nouveau code envoye.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-700">{orgName}</h1>
          <p className="mt-2 text-sm text-gray-500">Reinitialisation du mot de passe</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-card">
          {step === 'identifier' && (
            <form onSubmit={handleRequest} className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">Mot de passe oublie</h2>
              <p className="text-sm text-gray-500">
                Entrez votre email ou telephone. Si un compte existe, vous recevrez un code valable
                10 minutes.
              </p>

              {/* Toggle telephone / email */}
              <div className="flex rounded-xl bg-gray-100 p-1">
                {(['phone', 'email'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                      mode === m ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {m === 'phone' ? 'Telephone' : 'Email'}
                  </button>
                ))}
              </div>

              {mode === 'phone' ? (
                <AppPhoneInput
                  label="Numero de telephone"
                  value={phone}
                  onChange={(val) => setPhone(val || '')}
                  defaultCountry="CM"
                  placeholder="+237 6XX XXX XXX"
                />
              ) : (
                <AppInput
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@email.com"
                />
              )}

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <AppButton type="submit" loading={loading} className="w-full">
                Envoyer le code
              </AppButton>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleVerify} className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">Code de verification</h2>
              <p className="text-sm text-gray-500">
                Saisissez le code a 6 chiffres recu par email, SMS et WhatsApp.
              </p>

              <AppInput
                label="Code de verification"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
              />

              {info && (
                <div className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-700">{info}</div>
              )}
              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <AppButton type="submit" loading={loading} className="w-full">
                Verifier le code
              </AppButton>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-sm font-medium text-primary-600 disabled:opacity-50"
              >
                Renvoyer un code
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleReset} className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">Nouveau mot de passe</h2>
              <p className="text-sm text-gray-500">Choisissez votre nouveau mot de passe.</p>

              <AppInput
                label="Nouveau mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 caracteres"
              />
              <AppInput
                label="Confirmer le mot de passe"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repetez le mot de passe"
              />

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <AppButton type="submit" loading={loading} className="w-full">
                Reinitialiser
              </AppButton>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/portal" className="font-medium text-primary-600">
            Retour a la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}

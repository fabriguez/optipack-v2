'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'creds' | '2fa'>('creds');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      // 2FA exige : { twoFaToken, requires2FA: true } ; sinon { token }
      if (r.data?.requires2FA) {
        setTwoFaToken(r.data.twoFaToken);
        setStep('2fa');
      } else if (r.data?.token) {
        setToken(r.data.token);
        router.replace('/dashboard');
      } else {
        setErr('Reponse inattendue du serveur');
      }
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Connexion echouee';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function submit2fa(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/2fa/confirm', { twoFaToken, code });
      if (r.data?.token) {
        setToken(r.data.token);
        router.replace('/dashboard');
      } else {
        setErr('Code 2FA invalide');
      }
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Code 2FA invalide';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="text-primary-700" size={28} />
          <div>
            <h1 className="text-lg font-semibold">TransitSoft Ops</h1>
            <p className="text-xs text-gray-500">Console d&apos;administration</p>
          </div>
        </div>

        {step === 'creds' ? (
          <form onSubmit={submitCreds} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Mot de passe</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              disabled={loading}
              className="w-full rounded-md bg-primary-700 py-2 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
            >
              {loading ? '...' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit2fa} className="space-y-3">
            <p className="text-sm text-gray-600">
              Saisissez le code 2FA de votre application authenticator.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-center text-lg tracking-widest"
              placeholder="000000"
            />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              disabled={loading || code.length !== 6}
              className="w-full rounded-md bg-primary-700 py-2 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
            >
              {loading ? '...' : 'Verifier'}
            </button>
            <button
              type="button"
              onClick={() => setStep('creds')}
              className="w-full text-xs text-gray-500 hover:underline"
            >
              Retour
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

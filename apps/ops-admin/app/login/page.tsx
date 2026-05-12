'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ShieldCheck } from 'lucide-react';

/**
 * Decode le payload JWT du challengeToken pour savoir si c'est un setup
 * initial (kind='setup_required') ou une verification ulterieure ('totp_required').
 * Pas de signature check ici : on a juste besoin du `kind` pour router vers
 * le bon endpoint backend.
 */
function jwtKind(token: string): 'setup_required' | 'totp_required' | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload)) as { kind?: string };
    if (decoded.kind === 'setup_required' || decoded.kind === 'totp_required') {
      return decoded.kind;
    }
    return null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'creds' | '2fa'>('creds');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [twoFaKind, setTwoFaKind] = useState<'setup_required' | 'totp_required' | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      const data = r.data?.data ?? r.data;
      // Backend renvoie soit { challengeToken, requires2FA } soit { accessToken, opsAdmin }
      if (data?.requires2FA || data?.challengeToken) {
        const token = data.challengeToken ?? data.twoFaToken;
        setTwoFaToken(token);
        setTwoFaKind(jwtKind(token));
        setStep('2fa');
      } else if (data?.accessToken || data?.opsAdmin) {
        // Cookie httpOnly deja pose par le backend
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
      // 2 endpoints selon le contexte :
      //  - setup_required : 1er login, on confirme le setup TOTP via /2fa/confirm
      //  - totp_required  : 2FA deja active, on rejoue /auth/login avec totpCode
      const r =
        twoFaKind === 'totp_required'
          ? await api.post('/auth/login', { email, password, totpCode: code })
          : await api.post('/auth/2fa/confirm', {
              challengeToken: twoFaToken,
              totpCode: code,
            });
      const data = r.data?.data ?? r.data;
      if (data?.accessToken || data?.opsAdmin) {
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

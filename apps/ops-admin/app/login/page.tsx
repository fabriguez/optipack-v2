'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ShieldCheck } from 'lucide-react';

function jwtKind(token: string): 'setup_required' | 'totp_required' | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload)) as { kind?: string };
    if (decoded.kind === 'setup_required' || decoded.kind === 'totp_required') return decoded.kind;
    return null;
  } catch {
    return null;
  }
}

type Step = 'creds' | 'totp' | 'setup-qr' | 'setup-confirm' | 'recovery-codes';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('creds');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      const data = r.data?.data ?? r.data;
      if (data?.requires2FA || data?.challengeToken) {
        const token: string = data.challengeToken ?? data.twoFaToken;
        const kind = jwtKind(token);
        setChallengeToken(token);
        setCode('');
        if (kind === 'setup_required') {
          // Lancer immediatement la generation du QR
          await startSetup(token);
        } else {
          setStep('totp');
        }
      } else if (data?.accessToken || data?.opsAdmin) {
        router.replace('/dashboard');
      } else {
        setErr('Reponse inattendue du serveur');
      }
    } catch (e) {
      setErr(extractMsg(e) ?? 'Connexion echouee');
    } finally {
      setLoading(false);
    }
  }

  async function startSetup(token: string) {
    setLoading(true);
    try {
      const r = await api.post('/auth/2fa/setup', { challengeToken: token });
      const data = r.data?.data ?? r.data;
      setQrDataUrl(data.qrCodeDataUrl ?? '');
      setTotpSecret(data.secret ?? '');
      setStep('setup-qr');
    } catch (e) {
      setErr(extractMsg(e) ?? 'Erreur generation QR');
    } finally {
      setLoading(false);
    }
  }

  async function submitTotpLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password, totpCode: code });
      const data = r.data?.data ?? r.data;
      if (data?.accessToken || data?.opsAdmin) {
        router.replace('/dashboard');
      } else {
        setErr('Code 2FA invalide');
      }
    } catch (e) {
      setErr(extractMsg(e) ?? 'Code 2FA invalide');
    } finally {
      setLoading(false);
    }
  }

  async function submitSetupConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post('/auth/2fa/confirm', { challengeToken, totpCode: code });
      const data = r.data?.data ?? r.data;
      if (data?.recoveryCodes) {
        setRecoveryCodes(data.recoveryCodes);
        setStep('recovery-codes');
      } else if (data?.accessToken || data?.opsAdmin) {
        router.replace('/dashboard');
      } else {
        setErr('Code invalide');
      }
    } catch (e) {
      setErr(extractMsg(e) ?? 'Code 2FA invalide');
    } finally {
      setLoading(false);
    }
  }

  function extractMsg(e: unknown): string | null {
    return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? null;
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

        {step === 'creds' && (
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
        )}

        {step === 'totp' && (
          <form onSubmit={submitTotpLogin} className="space-y-3">
            <p className="text-sm text-gray-600">
              Saisissez le code de votre application authenticator.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
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
            <button type="button" onClick={() => setStep('creds')} className="w-full text-xs text-gray-500 hover:underline">
              Retour
            </button>
          </form>
        )}

        {step === 'setup-qr' && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-800">Configurer la double authentification</p>
            <p className="text-xs text-gray-500">
              Scannez ce QR code avec Google Authenticator, Authy ou toute app compatible TOTP.
            </p>
            {qrDataUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code 2FA" className="h-44 w-44" />
              </div>
            )}
            {totpSecret && (
              <div className="rounded bg-gray-100 px-3 py-2 text-center font-mono text-xs text-gray-700 select-all">
                {totpSecret}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Ou saisissez le code secret manuellement dans votre app.
            </p>
            <button
              onClick={() => { setCode(''); setStep('setup-confirm'); }}
              className="w-full rounded-md bg-primary-700 py-2 text-sm font-medium text-white hover:bg-primary-900"
            >
              J&apos;ai scanné, continuer
            </button>
          </div>
        )}

        {step === 'setup-confirm' && (
          <form onSubmit={submitSetupConfirm} className="space-y-3">
            <p className="text-sm text-gray-600">
              Saisissez le code affiché dans votre application pour confirmer.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
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
              {loading ? '...' : 'Activer la 2FA'}
            </button>
            <button type="button" onClick={() => setStep('setup-qr')} className="w-full text-xs text-gray-500 hover:underline">
              Retour au QR
            </button>
          </form>
        )}

        {step === 'recovery-codes' && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-800">2FA activée — codes de récupération</p>
            <p className="text-xs text-red-600 font-medium">
              Sauvegardez ces codes maintenant. Ils ne seront plus affichés.
            </p>
            <div className="rounded bg-gray-100 p-3 font-mono text-xs space-y-1">
              {recoveryCodes.map((c) => (
                <div key={c} className="text-gray-700 select-all">{c}</div>
              ))}
            </div>
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full rounded-md bg-primary-700 py-2 text-sm font-medium text-white hover:bg-primary-900"
            >
              Accéder au tableau de bord
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

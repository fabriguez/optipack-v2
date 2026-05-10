/**
 * Feedback sonore pour les scans QR / code-barres.
 *
 * Utilise le Web Audio API (pas de fichier audio a charger). Genere des bips
 * synthetises pour 4 statuts :
 *  - success : bip court, frequence montante (succes franc, ex: scan accepte)
 *  - warning : bip plat (deja scanne, doublon — pas grave mais pas un succes)
 *  - error   : 2 bips graves (echec, colis introuvable)
 *  - info    : bip neutre (action sans verdict, ex: ajout au panier en attente)
 *
 * On instancie un AudioContext partage et lazy : sur la 1ere interaction utilisateur,
 * sinon iOS/Safari bloque la lecture audio (autoplay policy).
 */

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (muted) return null;
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext =
      (window.AudioContext as typeof AudioContext) ||
      ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

interface BeepSpec {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
}

function playSequence(beeps: BeepSpec[]) {
  const c = getCtx();
  if (!c) return;
  // iOS : si le contexte est suspendu (changement de page, lock screen), on tente
  // un resume. En cas d'echec on laisse passer silencieusement.
  if (c.state === 'suspended') {
    void c.resume().catch(() => {});
  }
  let when = c.currentTime;
  for (const b of beeps) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = b.type ?? 'sine';
    osc.frequency.setValueAtTime(b.freq, when);
    const vol = b.volume ?? 0.15;
    // Petite enveloppe : attaque rapide, relachement court pour eviter le clic.
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.005);
    gain.gain.linearRampToValueAtTime(0, when + b.duration);
    osc.connect(gain).connect(c.destination);
    osc.start(when);
    osc.stop(when + b.duration + 0.02);
    when += b.duration + 0.02;
  }
}

export const scanSound = {
  success() {
    playSequence([
      { freq: 880, duration: 0.07 },
      { freq: 1320, duration: 0.1 },
    ]);
  },
  warning() {
    playSequence([{ freq: 600, duration: 0.18, type: 'square', volume: 0.1 }]);
  },
  error() {
    playSequence([
      { freq: 220, duration: 0.12, type: 'sawtooth', volume: 0.12 },
      { freq: 180, duration: 0.18, type: 'sawtooth', volume: 0.12 },
    ]);
  },
  info() {
    playSequence([{ freq: 700, duration: 0.08 }]);
  },
  setMuted(value: boolean) {
    muted = value;
  },
  isMuted() {
    return muted;
  },
};

// Logs persistants pour investiguer les deconnexions surprise.
// Survivent au signOut + reload (ce qui efface la console). Lus sur la page de login.
//
// Utilisation cote console (DevTools) :
//   JSON.parse(localStorage.getItem('authDebugLog') ?? '[]')
//   localStorage.removeItem('authDebugLog')   // pour repartir a zero

const KEY = 'authDebugLog';
const MAX_ENTRIES = 50;

export interface AuthDebugEntry {
  ts: string;
  kind: string;
  detail?: Record<string, unknown>;
}

export function authLog(kind: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const list: AuthDebugEntry[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    list.push({ ts: new Date().toISOString(), kind, detail });
    while (list.length > MAX_ENTRIES) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
    // Console aussi pour le cas DevTools "Preserve log" actif.
    // eslint-disable-next-line no-console
    console.log(`[auth] ${kind}`, detail ?? '');
  } catch {
    // localStorage indispo (mode prive, quota...) -> on ignore
  }
}

export function readAuthLog(): AuthDebugEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearAuthLog() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

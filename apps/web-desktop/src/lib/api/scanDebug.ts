// Logs persistants pour diagnostiquer le scanner QR (analogue a authDebug).
// Survivent a la fermeture du dialog. Lus depuis la console DevTools :
//   JSON.parse(localStorage.getItem('scanDebugLog') ?? '[]')

const KEY = 'scanDebugLog';
const MAX_ENTRIES = 60;

export interface ScanDebugEntry {
  ts: string;
  kind: string;
  detail?: Record<string, unknown>;
}

export function scanLog(kind: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const list: ScanDebugEntry[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    list.push({ ts: new Date().toISOString(), kind, detail });
    while (list.length > MAX_ENTRIES) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
    // eslint-disable-next-line no-console
    console.log(`[scan] ${kind}`, detail ?? '');
  } catch {
    // ignore quota / private mode
  }
}

export function readScanLog(): ScanDebugEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearScanLog() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

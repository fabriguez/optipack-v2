/**
 * Calcule le JOUR CALENDAIRE de la date passee dans le fuseau cible, et
 * retourne un Date a UTC midnight de ce jour. Stocke tel quel par Prisma en
 * @db.Date -> conserve la portion date intacte quel que soit le fuseau du
 * serveur. Utilise partout ou une "date de jour" agence est manipulee
 * (caisses, rapports journaliers) pour garantir une convention unique.
 */
export function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0, 0));
}

/**
 * Convertit une heure locale "HH:mm" d'un jour agence (encode UTC midnight,
 * cf startOfDayInTimezone) en instant UTC reel. Ex : jour 2026-07-06,
 * "08:00" en Africa/Douala (UTC+1) -> 2026-07-06T07:00:00Z. Utilise pour
 * borner la fenetre du rapport journalier sur la plage horaire de l'agence.
 */
export function utcInstantForLocalTime(dayUtcMidnight: Date, hhmm: string, timeZone: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  // Point de depart : l'heure demandee lue comme si elle etait UTC, corrigee
  // ensuite par l'offset reel du fuseau a cet instant (double passe pour les
  // bascules DST).
  const naive = new Date(dayUtcMidnight.getTime() + (h * 60 + m) * 60 * 1000);
  const offset1 = timezoneOffsetMinutes(naive, timeZone);
  const firstGuess = new Date(naive.getTime() - offset1 * 60 * 1000);
  const offset2 = timezoneOffsetMinutes(firstGuess, timeZone);
  return offset2 === offset1 ? firstGuess : new Date(naive.getTime() - offset2 * 60 * 1000);
}

/** Offset (minutes) du fuseau cible par rapport a UTC a l'instant donne. */
function timezoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

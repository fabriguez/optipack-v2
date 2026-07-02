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

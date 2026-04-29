export function formatDate(d: string | Date | null | undefined, locale = 'fr-FR'): string {
  if (!d) return '-';
  return new Date(d).toLocaleString(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatBytes(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (Number.isNaN(n)) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

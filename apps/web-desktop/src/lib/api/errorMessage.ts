/**
 * Extrait un message d'erreur lisible depuis une erreur axios / fetch.
 *
 * Priorite :
 *  1. response.data.message  (message metier renvoye par l'API)
 *  2. response.data.error
 *  3. premiere erreur de validation (response.data.errors)
 *  4. message de l'exception JS
 *  5. fallback fourni par l'appelant
 *
 * Usage : `onError: (e) => toast.error(extractApiError(e, 'Echec'))`.
 */
export function extractApiError(err: unknown, fallback = 'Une erreur est survenue'): string {
  const e = err as {
    response?: { data?: { message?: string; error?: string; errors?: Record<string, string[]> } };
    message?: string;
  };
  const data = e?.response?.data;
  if (data?.message && typeof data.message === 'string') return data.message;
  if (data?.error && typeof data.error === 'string') return data.error;
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors).flat()[0];
    if (typeof first === 'string' && first) return first;
  }
  // message JS exploitable uniquement (on masque les "Network Error" cryptiques
  // et les stack traces).
  if (e?.message && typeof e.message === 'string' && e.message !== 'Network Error') {
    return e.message;
  }
  return fallback;
}

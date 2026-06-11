import { apiClient } from './client';
import { toast } from 'sonner';

/**
 * Recupere un PDF d'une route API protegee, puis l'affiche en blob URL.
 * Resout le probleme de "window.open(URL, '_blank')" qui ouvre l'URL nue dans
 * un nouvel onglet : le navigateur n'envoie pas le header Authorization, donc
 * l'API repond 401.
 *
 * @param path Chemin relatif a apiClient (ex: '/manifests/abc/pdf')
 * @param opts.mode 'open' (defaut) ouvre dans un nouvel onglet, 'download' force le DL
 * @param opts.fileName Nom de fichier pour le mode download
 */
export async function fetchPdfAuthed(
  path: string,
  opts: { mode?: 'open' | 'download'; fileName?: string; mime?: string } = {},
) {
  // Si on telecharge un fichier non-PDF (XLSX par ex.), on force le mode
  // download : ouvrir un blob XLSX dans un onglet ne fait rien d'utile.
  const mime = opts.mime ?? 'application/pdf';
  const mode = opts.mode ?? (mime === 'application/pdf' ? 'open' : 'download');
  try {
    const res = await apiClient.get(path, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: mime });
    const url = window.URL.createObjectURL(blob);

    if (mode === 'download') {
      const link = document.createElement('a');
      link.href = url;
      link.download = opts.fileName ?? 'document.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      // Ouvre dans un nouvel onglet. Certains navigateurs en mode strict
      // bloquent window.open hors gesture utilisateur ; on rend la fonction
      // sync-callable en l'appelant depuis l'event handler du clic.
      const win = window.open(url, '_blank');
      if (!win) {
        // Popup bloque -> on declenche un download a la place
        const link = document.createElement('a');
        link.href = url;
        link.download = opts.fileName ?? 'document.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    }

    // Revoke un peu plus tard pour laisser le navigateur charger le blob.
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? 'Echec du chargement du PDF');
    return false;
  }
}

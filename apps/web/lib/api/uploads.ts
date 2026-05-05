import { apiClient } from './client';

export interface UploadResult {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

/**
 * Upload generique d'image (recus, justificatifs, photos, ...) sur l'API.
 * Retourne l'URL relative (servie par /api/v1/uploads/object/...) a stocker dans
 * les champs proofUrl / receiptUrl / etc.
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await apiClient.post<{ success: boolean; data: UploadResult }>(
    '/uploads/image',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data.data;
}

/**
 * Upload generique d'un fichier (PDF, XLSX, Word, image, ...).
 * Utilise pour les pieces jointes de rapports journaliers, etc.
 */
export async function uploadFile(file: File): Promise<UploadResult & { fileName?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<{ success: boolean; data: UploadResult & { fileName?: string } }>(
    '/uploads/file',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data.data;
}

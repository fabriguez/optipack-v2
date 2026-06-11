'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Camera, Trash2, FileText, Image as ImageIcon, Download, Eye } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AuthedImage, openAuthedFile } from '@/components/shared/AuthedImage';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import { apiClient } from '@/lib/api/client';
import { uploadFile } from '@/lib/api/uploads';
import { toast } from 'sonner';

type ParentType = 'expense' | 'disbursement' | 'debt' | 'fund-transfer';

interface Attachment {
  id: string;
  url: string;
  key: string;
  kind: 'IMAGE' | 'PDF' | 'OTHER';
  caption: string | null;
  createdAt: string;
  uploadedBy?: { firstName: string; lastName: string } | null;
}

function kindFromMime(mime: string): 'IMAGE' | 'PDF' | 'OTHER' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime === 'application/pdf') return 'PDF';
  return 'OTHER';
}

interface Props {
  parentType: ParentType;
  parentId: string;
  /** Lecture seule (cas decaissement immutable apres voiding). */
  readonly?: boolean;
  title?: string;
}

/**
 * Pieces jointes generiques (images + PDF + autres documents) pour
 * Expense / Disbursement / Debt. Upload via POST /uploads/file -> persiste
 * (url, key, kind) puis enregistre via /:type/:id/attachments. Affichage
 * grille images cliquable + liste PDF/OTHER avec ouverture en blob authed.
 */
export function AttachmentsCard({ parentType, parentId, readonly = false, title }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const endpoint = `/${parentType}s/${parentId}/attachments`;
  const queryKey = ['attachments', parentType, parentId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => apiClient.get(endpoint).then((r) => r.data),
    enabled: !!parentId,
  });
  const attachments: Attachment[] = data?.data ?? [];
  const images = attachments.filter((a) => a.kind === 'IMAGE');
  const docs = attachments.filter((a) => a.kind !== 'IMAGE');

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success('Piece jointe supprimee');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec suppression'),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        const uploaded = await uploadFile(file);
        await apiClient.post(endpoint, {
          url: uploaded.url,
          key: uploaded.key,
          kind: kindFromMime(file.type),
          caption: caption.trim() || file.name,
        });
        ok++;
      } catch (err: any) {
        toast.error(err?.response?.data?.message || `Echec upload ${file.name}`);
      }
    }
    if (ok > 0) {
      toast.success(`${ok} piece(s) jointe(s) ajoutee(s)`);
      qc.invalidateQueries({ queryKey });
      setCaption('');
    }
    setUploading(false);
  };

  return (
    <AppCard>
      <AppCardHeader
        title={title ?? `Pieces jointes (${attachments.length})`}
        description="Images, PDF et documents justificatifs"
      />

      {!readonly && (
        <div className="space-y-2 mb-4">
          <AppInput
            label="Legende (appliquee aux prochains uploads)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optionnel"
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); if (cameraRef.current) cameraRef.current.value = ''; }}
            />
            <AppButton variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Paperclip className="h-4 w-4" />
              Fichiers
            </AppButton>
            <AppButton variant="outline" size="sm" onClick={() => cameraRef.current?.click()} loading={uploading}>
              <Camera className="h-4 w-4" />
              Camera
            </AppButton>
          </div>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Aucune piece jointe</p>
      ) : (
        <div className="space-y-4">
          {images.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Images ({images.length})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, idx) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-xl border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className="block h-28 w-full cursor-zoom-in"
                      aria-label="Agrandir image"
                    >
                      <AuthedImage src={img.url} alt={img.caption || 'Justificatif'} className="h-28 w-full object-cover transition-transform group-hover:scale-105" />
                    </button>
                    {img.caption && (
                      <p className="px-2 py-1 text-xs text-gray-600 truncate">{img.caption}</p>
                    )}
                    {!readonly && (
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(img.id)}
                        className="absolute right-1 top-1 rounded-lg bg-white/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-red-50 group-hover:opacity-100"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Documents ({docs.length})</p>
              <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {d.kind === 'PDF' ? (
                        <FileText className="h-4 w-4 shrink-0 text-red-500" />
                      ) : (
                        <ImageIcon className="h-4 w-4 shrink-0 text-gray-500" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{d.caption || '(sans legende)'}</p>
                        <p className="text-[11px] text-gray-400">
                          {d.kind}
                          {d.uploadedBy && ` · ${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void openAuthedFile(d.url).catch(() => {})}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-700"
                        title="Ouvrir"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAuthedFile(d.url, d.caption || `document-${d.id}`, true).catch(() => {})}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-700"
                        title="Telecharger"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {!readonly && (
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(d.id)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ImageLightbox
        images={images.map((img) => ({ url: img.url, caption: img.caption }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </AppCard>
  );
}

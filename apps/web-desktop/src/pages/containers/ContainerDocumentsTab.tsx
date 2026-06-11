import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, Trash2, Edit2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { ImageInput } from '@/components/shared/ImageInput';
import { openAuthedFile } from '@/components/shared/AuthedImage';
import { uploadImage, uploadFile } from '@/lib/api/uploads';
import { formatDate } from '@transitsoftservices/shared';
import { toast } from 'sonner';

interface Doc {
  id: string;
  url: string;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  caption: string | null;
  isImage: boolean;
  uploader: { firstName: string; lastName: string } | null;
  createdAt: string;
}

const MAX_DOCS = 10;

export function ContainerDocumentsTab({ containerId }: { containerId: string }) {
  const qc = useQueryClient();
  const [pendingCaption, setPendingCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['containers', containerId, 'documents'],
    queryFn: () => apiClient.get(`/containers/${containerId}/documents`).then((r) => r.data),
  });
  const docs: Doc[] = data?.data ?? [];
  const remaining = MAX_DOCS - docs.length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['containers', containerId, 'documents'] });

  const handleUpload = async (file: File) => {
    if (docs.length >= MAX_DOCS) {
      toast.error(`Limite atteinte : ${MAX_DOCS} documents max`);
      return;
    }
    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      const uploaded = isImage ? await uploadImage(file) : await uploadFile(file);
      await apiClient.post(`/containers/${containerId}/documents`, {
        url: uploaded.url,
        storageKey: uploaded.key,
        fileName: file.name,
        contentType: uploaded.contentType,
        size: uploaded.size,
        caption: pendingCaption.trim() || null,
        isImage,
      });
      setPendingCaption('');
      invalidate();
      toast.success('Document ajoute');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/containers/${containerId}/documents/${id}`),
    onSuccess: () => { toast.success('Document supprime'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Suppression impossible'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Documents et images <span className="text-xs text-gray-500">({docs.length}/{MAX_DOCS})</span>
        </h3>
      </div>

      {remaining <= 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Limite atteinte ({MAX_DOCS} max). Supprimez un document pour en ajouter un autre.
        </div>
      ) : (
        <AppCard>
          <div className="space-y-3">
            <AppInput
              label="Libelle de la prochaine piece (optionnel)"
              value={pendingCaption}
              onChange={(e) => setPendingCaption(e.target.value)}
              placeholder="Ex: Facture douane, Photo arrivee, ..."
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ImageInput
                value={null}
                onFile={handleUpload}
                uploading={uploading}
                allowClear={false}
                height={200}
                hint="Glissez ou photographiez une image"
              />
              <label className="flex h-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50/40">
                <Paperclip className="mb-2 h-5 w-5 text-gray-400" />
                <span>Ajouter PDF / XLSX / Word / autre</span>
                {uploading && <span className="mt-1 text-primary-600">Upload en cours...</span>}
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </AppCard>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : docs.length === 0 ? (
        <AppCard><p className="py-6 text-center text-sm text-gray-400">Aucun document.</p></AppCard>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              onOpen={() => openAuthedFile(d.url, d.fileName ?? 'document').catch(() => toast.error('Echec telechargement'))}
              onSaveCaption={async (c) => {
                try {
                  await apiClient.patch(`/containers/${containerId}/documents/${d.id}`, { caption: c });
                  toast.success('Libelle mis a jour');
                  invalidate();
                } catch (e: any) { toast.error(e?.response?.data?.message || 'Echec'); }
              }}
              onDelete={() => deleteMutation.mutate(d.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocRow({ doc, onOpen, onSaveCaption, onDelete }: { doc: Doc; onOpen: () => void; onSaveCaption: (c: string) => void; onDelete: () => void }) {
  const [caption, setCaption] = useState(doc.caption ?? '');
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 items-center gap-2 truncate text-primary-700 hover:underline"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{doc.caption || doc.fileName || 'document'}</span>
          {doc.fileName && doc.caption && <span className="text-xs text-gray-400 truncate">({doc.fileName})</span>}
          {doc.isImage && <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">IMG</span>}
        </button>
        <span className="text-[11px] text-gray-400">{formatDate(doc.createdAt)}</span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Editer libelle">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="rounded-lg p-1 text-red-500 hover:bg-red-50" aria-label="Supprimer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Libelle"
            className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none"
          />
          <AppButton size="sm" onClick={() => { onSaveCaption(caption); setEditing(false); }}>
            Sauver
          </AppButton>
        </div>
      )}
    </li>
  );
}

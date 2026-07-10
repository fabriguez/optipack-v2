import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { ImageInput } from '@/components/shared/ImageInput';
import { Can } from '@/lib/components/Can';
import { uploadImage, uploadFile } from '@/lib/api/uploads';
import { openAuthedFile } from '@/components/shared/AuthedImage';
import { formatDate } from '@transitsoftservices/shared';
import { FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_OPTIONS = [
  { value: 'DIPLOMA', label: 'Diplome' },
  { value: 'CV', label: 'CV' },
  { value: 'CONTRACT', label: 'Contrat' },
  { value: 'ID_DOCUMENT', label: "Document d'identite" },
  { value: 'CERTIFICATE', label: 'Certificat / Attestation' },
  { value: 'OTHER', label: 'Autre' },
];
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState('DIPLOMA');
  const [label, setLabel] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [pending, setPending] = useState<{ url: string; key?: string; contentType?: string; size?: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['employees', employeeId, 'documents'],
    queryFn: () => apiClient.get(`/employees/${employeeId}/documents`).then((r) => r.data),
    enabled: !!employeeId,
  });
  const items: any[] = data?.data ?? [];

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const isImage = file.type.startsWith('image/');
      const up = isImage ? await uploadImage(file) : await uploadFile(file);
      setPending({ url: up.url, key: up.key, contentType: up.contentType, size: up.size });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec upload');
    } finally {
      setUploading(false);
    }
  };

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/employees/${employeeId}/documents`, {
        type,
        label: label.trim(),
        url: pending?.url,
        storageKey: pending?.key,
        contentType: pending?.contentType,
        size: pending?.size,
        validUntil: validUntil || undefined,
      }),
    onSuccess: () => {
      toast.success('Document ajoute');
      setLabel('');
      setValidUntil('');
      setPending(null);
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'documents'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/employees/documents/${id}`),
    onSuccess: () => {
      toast.success('Document supprime');
      qc.invalidateQueries({ queryKey: ['employees', employeeId, 'documents'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  return (
    <div className="space-y-4">
      {/* POST /employees/:id/documents exige personnel.update */}
      <Can permission="personnel.update">
      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Ajouter un document</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AppSelect label="Type" options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <AppInput
            label="Libelle"
            placeholder="Master en logistique, contrat 2025..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <AppInput
            label="Date de validite (optionnel)"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <ImageInput
            value={pending?.url ?? null}
            onFile={handleUpload}
            uploading={uploading}
            allowClear={!!pending}
            onClear={() => setPending(null)}
            height={120}
            hint="Photo / scan du document (image)"
          />
          <label className="flex h-30 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50/40">
            <FileText className="mb-2 h-5 w-5 text-gray-400" />
            <span>Ou uploader un PDF / DOCX / XLSX</span>
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
        <div className="mt-3 flex justify-end">
          <AppButton
            onClick={() => addMutation.mutate()}
            loading={addMutation.isPending}
            disabled={!pending || !label.trim()}
          >
            Enregistrer
          </AppButton>
        </div>
      </AppCard>
      </Can>

      <AppCard>
        <h3 className="mb-3 text-base font-semibold">Documents ({items.length})</h3>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun document.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="block text-left font-medium text-primary-700 hover:underline truncate"
                    onClick={() => openAuthedFile(d.url, d.label).catch(() => toast.error('Echec ouverture'))}
                  >
                    {d.label}
                  </button>
                  <p className="text-xs text-gray-500">
                    {TYPE_LABEL[d.type] ?? d.type}
                    {d.validUntil && ` · valide jusqu'au ${formatDate(d.validUntil)}`}
                    {d.contentType && ` · ${d.contentType}`}
                  </p>
                </div>
                <Can permission="personnel.update">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('Supprimer ce document ?')) return;
                      deleteMutation.mutate(d.id);
                    }}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}

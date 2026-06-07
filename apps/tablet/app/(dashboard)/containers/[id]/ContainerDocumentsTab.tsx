import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { formatDate } from '@transitsoftservices/shared';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { containersApi } from '@/lib/api/containers';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function ContainerDocumentsTab({ containerId }: { containerId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['containers', containerId, 'documents'], queryFn: () => containersApi.documents(containerId), enabled: !!containerId });
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<any | null>(null);

  const docs: any[] = data?.data ?? data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['containers', containerId, 'documents'] });

  const del = useMutation({
    mutationFn: (docId: string) => containersApi.deleteDocument(containerId, docId),
    onSuccess: () => { invalidate(); toast.success('Document supprime'); setToDelete(null); },
    onError: () => toast.error('Erreur'),
  });

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setBusy(true);
      const isImage = (a.mimeType ?? '').startsWith('image/');
      const fd = new FormData();
      fd.append(isImage ? 'image' : 'file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as never);
      const up = await apiClient.post(isImage ? '/uploads/image' : '/uploads/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
      const u = up?.data ?? up;
      await containersApi.addDocument(containerId, { url: u.url, storageKey: u.key ?? null, fileName: a.name, contentType: a.mimeType ?? null, size: a.size ?? null, caption: caption || null, isImage });
      setCaption('');
      invalidate();
      toast.success('Document ajoute');
    } catch {
      toast.error("Echec de l'ajout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={`Documents (${docs.length})`} action={<Button size="sm" loading={busy} onPress={pick}>Ajouter</Button>}>
      <View style={{ marginBottom: spacing.md }}>
        <Input label="Legende (optionnelle, pour le prochain ajout)" value={caption} onChangeText={setCaption} placeholder="Ex: Connaissement" />
      </View>
      {docs.length === 0 ? (
        <EmptyState text="Aucun document" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {docs.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.lg }}>
              <Ionicons name={d.isImage ? 'image-outline' : 'document-text-outline'} size={22} color={colors.primary[600]} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>{d.caption || d.fileName || 'Document'}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[400] }}>{formatDate(d.createdAt)}</Text>
              </View>
              <Pressable onPress={() => setToDelete(d)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
            </View>
          ))}
        </View>
      )}

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete.id)} title="Supprimer le document" message={toDelete?.caption || toDelete?.fileName || ''} confirmLabel="Supprimer" variant="destructive" loading={del.isPending} />
    </SectionCard>
  );
}

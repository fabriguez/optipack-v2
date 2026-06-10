import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { resolveTabletImageUrl } from '@/components/shared/AgencyAvatar';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/api/download';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type ParentType = 'expense' | 'disbursement' | 'debt' | 'fund-transfer';

/** Pieces jointes (images + documents) reutilisable (mirror web AttachmentsCard). */
export function AttachmentsSection({ parentType, parentId, readonly }: { parentType: ParentType; parentId: string; readonly?: boolean }) {
  const qc = useQueryClient();
  const endpoint = `/${parentType}s/${parentId}/attachments`;
  const queryKey = ['attachments', parentType, parentId];
  const { data } = useQuery({ queryKey, queryFn: () => apiClient.get(endpoint).then((r) => r.data), enabled: !!parentId });
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<any | null>(null);

  const attachments: any[] = data?.data ?? [];

  const add = useMutation({
    mutationFn: (payload: { url: string; key: string; kind: string; caption?: string }) => apiClient.post(endpoint, payload).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success('Piece jointe ajoutee'); },
    onError: () => toast.error('Erreur ajout'),
  });
  const remove = useMutation({
    mutationFn: (attId: string) => apiClient.delete(`${endpoint}/${attId}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setToDelete(null); toast.success('Supprimee'); },
    onError: () => toast.error('Erreur suppression'),
  });

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      setBusy(true);
      for (const a of res.assets ?? []) {
        const isImage = (a.mimeType ?? '').startsWith('image/');
        const fd = new FormData();
        fd.append('file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as never);
        const up = await apiClient.post('/uploads/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
        const u = up?.data ?? up;
        if (u?.url) await add.mutateAsync({ url: u.url, key: u.key ?? '', kind: isImage ? 'IMAGE' : (a.mimeType === 'application/pdf' ? 'PDF' : 'OTHER'), caption: a.name });
      }
    } catch { toast.error('Echec upload'); } finally { setBusy(false); }
  };

  const images = attachments.filter((a) => a.kind === 'IMAGE');
  const docs = attachments.filter((a) => a.kind !== 'IMAGE');

  return (
    <SectionCard title={`Pieces jointes (${attachments.length})`} action={!readonly ? <Button size="sm" variant="outline" loading={busy} onPress={pick}>Ajouter</Button> : undefined}>
      {attachments.length === 0 ? (
        <EmptyState text="Aucune piece jointe" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {images.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {images.map((a) => (
                <View key={a.id} style={{ position: 'relative' }}>
                  <Image source={{ uri: resolveTabletImageUrl(a.url) ?? '' }} style={{ width: 110, height: 110, borderRadius: radius.md, backgroundColor: colors.gray[100] }} />
                  {!readonly && <Pressable onPress={() => setToDelete(a)} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={13} color={colors.white} /></Pressable>}
                </View>
              ))}
            </View>
          )}
          {docs.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gray[50], borderRadius: radius.sm, padding: spacing.sm }}>
              <Ionicons name="document-outline" size={18} color={colors.gray[600]} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.gray[700] }} numberOfLines={1}>{a.caption || a.fileName || 'Document'}</Text>
              <Pressable onPress={() => downloadAndShare(`/attachments/${a.id}/download`, a.caption || 'piece', a.kind === 'PDF' ? 'pdf' : 'pdf')} hitSlop={6}><Ionicons name="download-outline" size={18} color={colors.primary[600]} /></Pressable>
              {!readonly && <Pressable onPress={() => setToDelete(a)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>}
            </View>
          ))}
        </View>
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && remove.mutate(toDelete.id)} title="Supprimer la piece jointe" message="Cette piece jointe sera supprimee." confirmLabel="Supprimer" variant="destructive" loading={remove.isPending} />
    </SectionCard>
  );
}

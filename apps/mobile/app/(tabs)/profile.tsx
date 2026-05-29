import { ScrollView, View, Text, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { portalApi } from '@/lib/api/portal';
import { apiClient } from '@/lib/api/client';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

interface ProfileMe {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  imageUrl?: string | null;
  idDocumentUrl?: string | null;
  idDocumentBackUrl?: string | null;
  idVerificationStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  idExpiryDate?: string | null;
  idRejectionReason?: string | null;
}

async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission requise',
        'Acces aux photos necessaire. Active la permission dans Reglages.',
      );
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      selectionLimit: 1,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) return null;
    return res.assets[0];
  } catch (err: any) {
    Alert.alert('Erreur', err?.message ?? "Impossible d'ouvrir la galerie.");
    return null;
  }
}

async function uploadFile(uri: string, slot: 'avatar' | 'idDocument' | 'idDocumentBack'): Promise<string> {
  const form = new FormData();
  const filename = uri.split('/').pop() ?? `${slot}.jpg`;
  form.append('file', { uri, name: filename, type: 'image/jpeg' } as unknown as Blob);
  form.append('slot', slot);
  const { data } = await apiClient.post('/client-portal/me/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data?.data?.url ?? '';
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  NONE: 'default',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
};

const STATUS_LABEL: Record<string, string> = {
  NONE: 'Non soumis',
  PENDING: 'En attente',
  APPROVED: 'Valide',
  REJECTED: 'Refuse',
};

export default function ProfileTab() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => portalApi.me(),
  });

  const me = (data?.data ?? user) as ProfileMe;
  const verifyStatus = me?.idVerificationStatus ?? 'NONE';
  const locked = verifyStatus === 'APPROVED' && (!me?.idExpiryDate || new Date(me.idExpiryDate) > new Date());

  const handleUpload = async (slot: 'avatar' | 'idDocument' | 'idDocumentBack') => {
    if (locked && slot !== 'avatar') {
      Alert.alert('Verrouille', 'Documents valides, modification impossible avant peremption.');
      return;
    }
    const asset = await pickImage();
    if (!asset) return;
    setUploading(slot);
    try {
      await uploadFile(asset.uri, slot);
      toast.success('Document envoye');
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Echec de l'envoi");
    } finally {
      setUploading(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }}>
      <Card>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => handleUpload('avatar')} disabled={uploading === 'avatar'}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {me?.imageUrl ? (
                <Image source={{ uri: me.imageUrl }} style={{ width: 88, height: 88 }} />
              ) : (
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary[700] }}>
                  {me?.fullName?.[0]?.toUpperCase() ?? '?'}
                </Text>
              )}
              {uploading === 'avatar' && (
                <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white }}>
                <Ionicons name="camera" size={13} color={colors.white} />
              </View>
            </View>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900] }}>{me?.fullName ?? '—'}</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500] }}>{me?.email ?? ''}</Text>
            {me?.phone && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{me.phone}</Text>}
          </View>
        </View>
      </Card>

      <Card>
        <CardHeader title="Verification d'identite" right={<Badge variant={STATUS_VARIANT[verifyStatus]}>{STATUS_LABEL[verifyStatus]}</Badge>} />
        {verifyStatus === 'REJECTED' && me?.idRejectionReason && (
          <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: radius.md, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#B91C1C' }}>{me.idRejectionReason}</Text>
          </View>
        )}
        {locked && me?.idExpiryDate && (
          <View style={{ backgroundColor: '#E8F5E9', padding: 12, borderRadius: radius.md, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#1B5E20' }}>
              Documents valides. Verrouille jusqu'au {me.idExpiryDate.slice(0, 10)}.
            </Text>
          </View>
        )}
        <DocSlot
          label="Piece d'identite (recto)"
          uri={me?.idDocumentUrl}
          onUpload={() => handleUpload('idDocument')}
          uploading={uploading === 'idDocument'}
          disabled={locked}
        />
        <View style={{ height: 12 }} />
        <DocSlot
          label="Piece d'identite (verso)"
          uri={me?.idDocumentBackUrl}
          onUpload={() => handleUpload('idDocumentBack')}
          uploading={uploading === 'idDocumentBack'}
          disabled={locked}
        />
      </Card>

      <Card>
        <Pressable
          onPress={() => router.push('/profile-edit' as never)}
          disabled={locked}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, opacity: locked ? 0.5 : 1 }}
        >
          <Ionicons name="create-outline" size={20} color={colors.gray[700]} />
          <Text style={{ fontSize: 14, color: colors.gray[900], flex: 1 }}>Modifier mes informations</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
        </Pressable>
      </Card>

      <Button variant="destructive" onPress={() => logout()}>Deconnexion</Button>
    </ScrollView>
  );
}

function DocSlot({ label, uri, onUpload, uploading, disabled }: { label: string; uri?: string | null; onUpload: () => void; uploading: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onUpload} disabled={uploading || disabled} style={{ borderWidth: 1, borderColor: colors.gray[200], borderStyle: uri ? 'solid' : 'dashed', borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.6 : 1 }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.gray[100] }} />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="image-outline" size={24} color={colors.gray[400]} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colors.gray[500] }}>{uri ? 'Toucher pour changer' : 'Toucher pour ajouter'}</Text>
      </View>
      {uploading && <ActivityIndicator color={colors.primary[500]} />}
    </Pressable>
  );
}

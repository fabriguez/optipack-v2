import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/data/PageHeader';
import { AppDialog } from '@/components/forms/AppDialog';
import { resolveTabletImageUrl } from '@/components/shared/AgencyAvatar';
import { apiClient } from '@/lib/api/client';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

function useToken() { const [t, setT] = useState<string | null>(null); useEffect(() => { storage.get<string>(STORAGE_KEYS.accessToken).then((v) => setT(v ?? null)); }, []); return t; }

function Photo({ url, label, token }: { url?: string | null; label: string; token: string | null }) {
  const resolved = resolveTabletImageUrl(url);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: 11, color: colors.gray[400] }}>{label}</Text>
      {resolved ? (
        <Image source={{ uri: resolved, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={{ width: '100%', height: 140, borderRadius: radius.md, backgroundColor: colors.gray[100] }} resizeMode="contain" />
      ) : (
        <View style={{ height: 140, borderRadius: radius.md, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, color: colors.gray[400] }}>Pas de photo</Text></View>
      )}
    </View>
  );
}

export default function KycScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const token = useToken();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['clients', 'kyc', 'pending'], queryFn: () => apiClient.get('/clients/kyc/pending').then((r) => r.data) });
  const clients: any[] = data?.data ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<{ client: any; mode: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const verify = useMutation({
    mutationFn: () => apiClient.post(`/clients/${target!.client.id}/verify`, target!.mode === 'approve' ? { decision: 'APPROVED', expiryDate: expiry ? new Date(expiry).toISOString() : undefined } : { decision: 'REJECTED', reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', 'kyc', 'pending'] }); toast.success(target!.mode === 'approve' ? 'Client valide' : 'Documents refuses'); setTarget(null); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Validation KYC" subtitle="Documents d'identite en attente" left={<Pressable onPress={() => router.navigate('/clients')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>} actions={<Badge variant="warning">{`${clients.length} en attente`}</Badge>} />
        {isLoading ? null : clients.length === 0 ? (
          <Card><View style={{ alignItems: 'center', paddingVertical: 40, gap: spacing.sm }}><Ionicons name="shield-checkmark-outline" size={40} color={colors.gray[300]} /><Text style={{ fontSize: 14, color: colors.gray[400] }}>Aucun document en attente</Text></View></Card>
        ) : clients.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>{c.fullName}</Text>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>{c.phone}{c.idNumber ? ` · CNI ${c.idNumber}` : ''}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Photo url={c.idDocumentUrl} label="CNI - Recto" token={token} />
              <Photo url={c.idDocumentBackUrl} label="CNI - Verso" token={token} />
              <Photo url={c.imageUrl} label="Photo" token={token} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md }}>
              <Button variant="destructive" onPress={() => { setTarget({ client: c, mode: 'reject' }); setReason(''); }}>Refuser</Button>
              <Button onPress={() => { setTarget({ client: c, mode: 'approve' }); setExpiry(''); }}>Valider</Button>
            </View>
          </Card>
        ))}
      </ScrollView>

      <AppDialog open={!!target} onClose={() => setTarget(null)} title={target ? (target.mode === 'approve' ? `Valider ${target.client.fullName}` : `Refuser ${target.client.fullName}`) : ''} width={440}
        footer={<><Button variant="ghost" onPress={() => setTarget(null)}>Annuler</Button><Button variant={target?.mode === 'approve' ? 'primary' : 'destructive'} loading={verify.isPending} disabled={target?.mode === 'reject' && reason.trim().length === 0} onPress={() => verify.mutate()}>{target?.mode === 'approve' ? 'Valider' : 'Refuser'}</Button></>}>
        {target?.mode === 'approve' ? (
          <Input label="Date d'expiration (AAAA-MM-JJ, optionnel)" value={expiry} onChangeText={setExpiry} placeholder="2030-12-31" />
        ) : (
          <Input label="Motif du refus" value={reason} onChangeText={setReason} multiline placeholder="Document illisible, expire..." />
        )}
      </AppDialog>
    </View>
  );
}

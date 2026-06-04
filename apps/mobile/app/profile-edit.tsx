import { useState, useEffect } from 'react';
import { ScrollView, View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api/client';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';
import { toast } from '@/lib/toast';

export default function ProfileEditScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['portal', 'me'], queryFn: () => portalApi.me() });
  const me = data?.data;

  const [form, setForm] = useState({ fullName: '', phone: '', address: '' });
  useEffect(() => {
    if (me) setForm({ fullName: me.fullName ?? '', phone: me.phone ?? '', address: me.address ?? '' });
  }, [me]);

  const mutation = useMutation({
    mutationFn: (v: typeof form) => apiClient.patch('/client-portal/me', v).then((r) => r.data),
    onSuccess: () => {
      toast.success('Profil mis a jour');
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
      router.back();
    },
    onError: (e: any) => {
      const err = e as { isOfflineQueued?: boolean };
      if (err?.isOfflineQueued) {
        toast.info('Action mise en file');
        router.back();
        return;
      }
      toast.error(e?.response?.data?.message ?? 'Echec');
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Modifier le profil</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14 }}>
          <Input label="Nom complet" value={form.fullName} onChangeText={(t) => setForm((f) => ({ ...f, fullName: t }))} />
          <AppPhoneInput
            label="Telephone"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="6XX XX XX XX"
          />
          <Input label="Adresse" value={form.address} onChangeText={(t) => setForm((f) => ({ ...f, address: t }))} multiline />
          <Button onPress={() => mutation.mutate(form)} loading={mutation.isPending}>
            {mutation.isPending ? 'Envoi...' : 'Enregistrer'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

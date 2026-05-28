import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';

export default function TrackScreen() {
  const params = useLocalSearchParams<{ tracking?: string }>();
  const router = useRouter();
  const [input, setInput] = useState(params.tracking ?? '');
  const [query, setQuery] = useState(params.tracking ?? '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['track', query],
    queryFn: () => portalApi.publicTrack(query),
    enabled: !!query,
  });

  const submit = () => {
    const v = input.trim();
    if (v) setQuery(v);
  };

  const parcel = data?.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Suivi de colis</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Numero de tracking"
            placeholderTextColor={colors.gray[400]}
            autoCapitalize="characters"
            style={{ flex: 1, height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.lg, backgroundColor: colors.white }}
            onSubmitEditing={submit}
          />
          <Pressable onPress={submit} style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Ionicons name="search" size={18} color={colors.white} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {isLoading && <ActivityIndicator color={colors.primary[500]} />}
        {error && (
          <Card>
            <Text style={{ fontSize: 13, color: colors.error, textAlign: 'center', padding: 20 }}>Colis introuvable</Text>
          </Card>
        )}
        {parcel && (
          <>
            <Card>
              <CardHeader title={parcel.trackingNumber} subtitle={parcel.designation} right={<Badge variant={parcel.status === 'DELIVERED' ? 'success' : 'warning'}>{parcel.status}</Badge>} />
              <Text style={{ fontSize: 13, color: colors.gray[600], marginTop: 4 }}>Destination: {parcel.destinationAgency?.name ?? parcel.warehouse?.name ?? '-'}</Text>
            </Card>
            <Card>
              <CardHeader title="Historique" />
              <View style={{ gap: 12 }}>
                {(parcel.history ?? []).map((h: any) => (
                  <View key={h.id} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500], marginTop: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{h.action ?? h.event}</Text>
                      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{h.createdAt?.slice(0, 16)}</Text>
                    </View>
                  </View>
                ))}
                {(!parcel.history || parcel.history.length === 0) && <Text style={{ fontSize: 12, color: colors.gray[400] }}>Aucun evenement</Text>}
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { portalApi } from '@/lib/api/portal';
import { colors, radius, spacing } from '@/lib/theme/colors';

type TransitType = 'AIR' | 'SEA' | 'LAND';

interface Route {
  id: string;
  name: string;
  type: TransitType;
  departureCity: string;
  arrivalCity: string;
  estimatedDurationDays: number;
  unit: 'kg' | 'm3';
}

interface Simulation {
  route: { departureCity: string; arrivalCity: string; type: TransitType; estimatedDurationDays: number };
  weight: number | null;
  volume: number | null;
  price: number;
  standardPrice: number;
  breakdown: { mode: string; ratePerKg: number; ratePerVolume: number; rateSource: 'route' | 'partner' };
  isPartner: boolean;
  partnerApplied: boolean;
  savings: number;
}

const TYPE_LABEL: Record<TransitType, string> = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' };
const TYPE_ICON: Record<TransitType, keyof typeof Ionicons.glyphMap> = {
  AIR: 'airplane',
  SEA: 'boat',
  LAND: 'bus',
};

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

export default function SimulateurScreen() {
  const router = useRouter();
  const [routeId, setRouteId] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['public', 'transit-routes'],
    queryFn: () => portalApi.publicTransitRoutes(),
  });
  const routes: Route[] = routesData?.data ?? [];

  const selected = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId]);
  const needsWeight = selected?.type === 'AIR' || selected?.type === 'LAND';
  const needsVolume = selected?.type === 'SEA' || selected?.type === 'LAND';

  const sim = useMutation({
    mutationFn: () => {
      const payload: { transitRouteId: string; weight?: number; volume?: number } = {
        transitRouteId: selected!.id,
      };
      if (needsWeight) payload.weight = Number(weight);
      if (needsVolume) payload.volume = Number(volume);
      return portalApi.simulatePrice(payload);
    },
  });

  const result: Simulation | undefined = sim.data?.data;
  const canSubmit =
    !!selected && (!needsWeight || Number(weight) > 0) && (!needsVolume || Number(volume) > 0);

  const onSelect = (id: string) => {
    setRouteId(id);
    setWeight('');
    setVolume('');
    sim.reset();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>Simulateur de prix</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* Selecteur de route */}
        <Card>
          <CardHeader title="Route de transit" subtitle="Choisissez votre trajet" />
          {routesLoading ? (
            <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 8 }} />
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {routes.map((r) => {
                const active = r.id === routeId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => onSelect(r.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: active ? colors.primary[500] : colors.gray[200],
                      backgroundColor: active ? colors.primary[50] : colors.white,
                    }}
                  >
                    <Ionicons
                      name={TYPE_ICON[r.type]}
                      size={20}
                      color={active ? colors.primary[600] : colors.gray[500]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>
                        {r.name}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary[500]} />}
                  </Pressable>
                );
              })}
              {routes.length === 0 && (
                <Text style={{ fontSize: 12, color: colors.gray[400] }}>Aucune route disponible.</Text>
              )}
            </View>
          )}
        </Card>

        {/* Masse / volume */}
        {selected && (
          <Card>
            <CardHeader title="Mesures" subtitle={`Renseignez ${needsWeight && needsVolume ? 'la masse et le volume' : needsWeight ? 'la masse' : 'le volume'}`} />
            <View style={{ gap: 12, marginTop: 8 }}>
              {needsWeight && (
                <Field
                  label="Masse (kg)"
                  value={weight}
                  onChange={setWeight}
                  placeholder="Ex : 25"
                />
              )}
              {needsVolume && (
                <Field
                  label="Volume (m3)"
                  value={volume}
                  onChange={setVolume}
                  placeholder="Ex : 1.5"
                />
              )}
            </View>

            <Pressable
              onPress={() => sim.mutate()}
              disabled={!canSubmit || sim.isPending}
              style={({ pressed }) => ({
                marginTop: spacing.lg,
                height: 48,
                borderRadius: radius.md,
                backgroundColor: colors.primary[500],
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              {sim.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name="calculator" size={18} color={colors.white} />
              )}
              <Text style={{ color: colors.white, fontSize: 15, fontWeight: '600' }}>Calculer le prix</Text>
            </Pressable>
          </Card>
        )}

        {sim.isError && (
          <Card>
            <Text style={{ fontSize: 13, color: colors.error, textAlign: 'center', padding: 12 }}>
              Impossible de calculer le prix. Reessayez.
            </Text>
          </Card>
        )}

        {result && <ResultCard result={result} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View>
      <Text style={{ fontSize: 12, color: colors.gray[600], marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        keyboardType="decimal-pad"
        style={{
          height: 44,
          borderWidth: 1,
          borderColor: colors.gray[300],
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.white,
          color: colors.gray[900],
        }}
      />
    </View>
  );
}

function ResultCard({ result }: { result: Simulation }) {
  return (
    <Card>
      <CardHeader
        title={`${result.route.departureCity} → ${result.route.arrivalCity}`}
        subtitle={`${TYPE_LABEL[result.route.type]} · ${result.route.estimatedDurationDays} j estimes`}
        right={result.partnerApplied ? <Badge variant="success">Partenaire</Badge> : undefined}
      />
      <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
        <Text style={{ fontSize: 11, color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 1 }}>
          Prix estime
        </Text>
        <Text style={{ fontSize: 32, fontWeight: '700', color: colors.primary[600], marginTop: 4 }}>
          {fcfa(result.price)}
        </Text>
        {result.partnerApplied && result.savings > 0 && (
          <Text style={{ fontSize: 13, color: colors.gray[700], marginTop: 6 }}>
            <Text style={{ textDecorationLine: 'line-through', color: colors.gray[400] }}>
              {fcfa(result.standardPrice)}
            </Text>{' '}
            · economie {fcfa(result.savings)}
          </Text>
        )}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md, gap: 6 }}>
        {result.weight != null && (
          <DetailRow label="Masse" value={`${result.weight} kg × ${fcfa(result.breakdown.ratePerKg)}/kg`} />
        )}
        {result.volume != null && (
          <DetailRow label="Volume" value={`${result.volume} m3 × ${fcfa(result.breakdown.ratePerVolume)}/m3`} />
        )}
        <DetailRow
          label="Tarif applique"
          value={result.breakdown.rateSource === 'partner' ? 'Partenaire' : 'Standard'}
        />
      </View>
      <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: spacing.md }}>
        Estimation indicative, hors frais annexes. Prix definitif confirme a l'enregistrement du colis.
      </Text>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

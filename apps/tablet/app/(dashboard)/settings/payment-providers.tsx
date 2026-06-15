import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/data/PageHeader';
import { SectionCard } from '@/components/data/DetailCards';
import { paymentConfigApi, type PaymentProvidersConfig, type PaymentChannelEntry, type PaymentProviderEntry } from '@/lib/api/organization';
import { colors } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';

const CHANNELS: { key: PaymentChannelEntry['channel']; label: string; icon: string }[] = [
  { key: 'MOBILE_MONEY', label: 'Mobile Money', icon: 'phone-portrait-outline' },
  { key: 'CARD', label: 'Carte bancaire', icon: 'card-outline' },
  { key: 'BANK_TRANSFER', label: 'Virement', icon: 'business-outline' },
  { key: 'USSD', label: 'USSD', icon: 'keypad-outline' },
];

const KNOWN_PROVIDERS: Record<string, { fields: string[] }> = {
  TARAMONEY: { fields: ['apiKey', 'businessId', 'webhookSecret'] },
  CAMPAY: { fields: ['apiUsername', 'apiPassword', 'webhookSecret'] },
  MESOMB: { fields: ['serviceKey', 'appKey', 'webhookSecret'] },
  NOTCHPAY: { fields: ['publicKey', 'privateKey'] },
  FLUTTERWAVE: { fields: ['secretKey', 'webhookSecret'] },
  STRIPE: { fields: ['secretKey', 'publishableKey', 'webhookSecret'] },
};

function ProviderCard({
  provider,
  onChange,
  onDelete,
}: {
  provider: PaymentProviderEntry;
  onChange: (p: PaymentProviderEntry) => void;
  onDelete: () => void;
}) {
  const fields = KNOWN_PROVIDERS[provider.name]?.fields ?? ['apiKey'];
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, marginBottom: spacing.md, overflow: 'hidden' }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, backgroundColor: colors.gray[50] }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{provider.name}</Text>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>Priorite {provider.priority}</Text>
        </View>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray[400]} />
      </Pressable>

      {expanded && (
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          {fields.map((field) => (
            <View key={field}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: colors.gray[600], marginBottom: 4 }}>{field}</Text>
              <TextInput
                value={provider.credentials?.[field] ?? ''}
                onChangeText={(v) =>
                  onChange({ ...provider, credentials: { ...provider.credentials, [field]: v } })
                }
                placeholder={field}
                secureTextEntry={field.toLowerCase().includes('secret') || field.toLowerCase().includes('key') || field.toLowerCase().includes('password')}
                style={{
                  borderWidth: 1,
                  borderColor: colors.gray[200],
                  borderRadius: radius.sm,
                  padding: spacing.sm,
                  fontSize: 13,
                  color: colors.gray[900],
                  backgroundColor: '#fff',
                  fontFamily: 'monospace',
                }}
              />
            </View>
          ))}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.gray[600], marginBottom: 4 }}>Countries (ISO2, virgule)</Text>
            <TextInput
              value={(provider.countries ?? []).join(', ')}
              onChangeText={(v) =>
                onChange({
                  ...provider,
                  countries: v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
                })
              }
              placeholder="CM, SN, CI (vide = tous pays)"
              style={{
                borderWidth: 1,
                borderColor: colors.gray[200],
                borderRadius: radius.sm,
                padding: spacing.sm,
                fontSize: 13,
                color: colors.gray[900],
                backgroundColor: '#fff',
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export default function PaymentProvidersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['payment-providers-config'],
    queryFn: () => paymentConfigApi.get().then((r) => r.data),
  });

  const [config, setConfig] = useState<PaymentProvidersConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [activeChannel, setActiveChannel] = useState<PaymentChannelEntry['channel']>('MOBILE_MONEY');

  if (data && !config) {
    setConfig(data);
  }

  const saveMutation = useMutation({
    mutationFn: (cfg: PaymentProvidersConfig) => paymentConfigApi.save(cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-providers-config'] });
      setDirty(false);
      Alert.alert('Succes', 'Configuration enregistree.');
    },
    onError: () => Alert.alert('Erreur', 'Impossible de sauvegarder.'),
  });

  const update = (newConfig: PaymentProvidersConfig) => {
    setConfig(newConfig);
    setDirty(true);
  };

  const getChannel = (ch: PaymentChannelEntry['channel']): PaymentChannelEntry => {
    return config?.channels.find((c) => c.channel === ch) ?? { channel: ch, providers: [] };
  };

  const setChannel = (ch: PaymentChannelEntry) => {
    if (!config) return;
    const channels = config.channels.filter((c) => c.channel !== ch.channel);
    if (ch.providers.length > 0) channels.push(ch);
    update({ channels });
  };

  const addProvider = (channelKey: PaymentChannelEntry['channel']) => {
    Alert.prompt('Ajouter un provider', 'Nom du provider (ex: TARAMONEY)', (name) => {
      if (!name) return;
      const ch = getChannel(channelKey);
      const newProvider: PaymentProviderEntry = {
        name: name.trim().toUpperCase(),
        priority: ch.providers.length + 1,
        countries: [],
        credentials: {},
      };
      setChannel({ ...ch, providers: [...ch.providers, newProvider] });
    });
  };

  if (isLoading || !config) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary[600]} />
      </View>
    );
  }

  const currentChannel = getChannel(activeChannel);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {dirty && (
        <View style={{ backgroundColor: colors.primary[600], padding: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing['2xl'] }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>Modifications non sauvegardees</Text>
          <Pressable
            onPress={() => config && saveMutation.mutate(config)}
            style={{ backgroundColor: '#fff', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm }}
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color={colors.primary[600]} />
              : <Text style={{ color: colors.primary[600], fontWeight: '700', fontSize: 13 }}>Sauvegarder</Text>
            }
          </Pressable>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }}>
        <PageHeader
          title="Providers de paiement"
          subtitle="Credentials et chaine de fallback par canal"
          left={<Pressable onPress={() => router.navigate('/settings')}><Ionicons name="arrow-back" size={22} color={colors.gray[600]} /></Pressable>}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {CHANNELS.map((ch) => (
            <Pressable
              key={ch.key}
              onPress={() => setActiveChannel(ch.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: activeChannel === ch.key ? colors.primary[600] : colors.gray[100],
              }}
            >
              <Ionicons
                name={ch.icon as never}
                size={16}
                color={activeChannel === ch.key ? '#fff' : colors.gray[500]}
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: activeChannel === ch.key ? '#fff' : colors.gray[700] }}>
                {ch.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <SectionCard title={`${CHANNELS.find((c) => c.key === activeChannel)?.label} — Providers (${currentChannel.providers.length})`}>
          {currentChannel.providers.length === 0 && (
            <Text style={{ fontSize: 13, color: colors.gray[400], paddingVertical: spacing.md }}>
              Aucun provider configure pour ce canal.
            </Text>
          )}
          {currentChannel.providers.map((p, i) => (
            <ProviderCard
              key={`${p.name}-${i}`}
              provider={p}
              onChange={(updated) => {
                const providers = [...currentChannel.providers];
                providers[i] = updated;
                setChannel({ ...currentChannel, providers });
              }}
              onDelete={() => {
                const providers = currentChannel.providers.filter((_, j) => j !== i);
                setChannel({ ...currentChannel, providers });
              }}
            />
          ))}
          <Pressable
            onPress={() => addProvider(activeChannel)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
            <Text style={{ fontSize: 14, color: colors.primary[600], fontWeight: '600' }}>Ajouter un provider</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    </View>
  );
}

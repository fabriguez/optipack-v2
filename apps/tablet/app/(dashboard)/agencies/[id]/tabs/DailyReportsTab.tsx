import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { SectionCard, StatCard, EmptyState } from '../_components';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAgencyDailyReports, useDailyReportMutations } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning'> = {
  GENERATED: 'warning',
  AMENDED: 'default',
  CLOSED: 'success',
};

const PAYLOAD_LABELS: Record<string, string> = {
  paymentsTotal: 'Recettes',
  entriesTotal: 'Entrees',
  disbursementsTotal: 'Sorties',
  expensesTotal: 'Depenses',
  advancesTotal: 'Avances',
  cashBalance: 'Solde caisse',
  netCashFlow: 'Solde net',
};

function payloadStats(payload: any): { label: string; value: string }[] {
  if (!payload || typeof payload !== 'object') return [];
  const out: { label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(PAYLOAD_LABELS)) {
    if (typeof payload[key] === 'number') out.push({ label, value: formatAmount(payload[key]) });
  }
  return out;
}

export function DailyReportsTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyDailyReports(agencyId);
  const { generate, update, email } = useDailyReportMutations(agencyId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [obs, setObs] = useState<Record<string, string>>({});

  const reports: any[] = data?.data ?? data ?? [];

  return (
    <SectionCard
      title="Rapports journaliers"
      subtitle="Observations et cloture par jour"
      action={<Button size="sm" loading={generate.isPending} onPress={() => generate.mutate(undefined)}>Generer aujourd'hui</Button>}
    >
      {reports.length === 0 ? (
        <EmptyState text="Aucun rapport" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {reports.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <View key={r.id} style={{ borderWidth: 1, borderColor: colors.gray[100], borderRadius: radius.md, overflow: 'hidden' }}>
                <Pressable
                  onPress={() => setExpanded(isOpen ? null : r.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, backgroundColor: colors.gray[50] }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray[500]} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{formatDate(r.date)}</Text>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>{r.status}</Badge>
                  </View>
                  {r._count?.attachments > 0 && (
                    <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r._count.attachments} pieces</Text>
                  )}
                </Pressable>

                {isOpen && (
                  <View style={{ padding: spacing.lg, gap: spacing.md }}>
                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button size="sm" variant="outline" loading={generate.isPending} onPress={() => generate.mutate(r.date)}>
                        Regenerer
                      </Button>
                      <Button size="sm" variant="outline" loading={email.isPending} onPress={() => email.mutate(r.id)}>
                        Envoyer par email
                      </Button>
                    </View>

                    {/* Stats du rapport (payload) */}
                    {payloadStats(r.payload).length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                        {payloadStats(r.payload).map((s) => (
                          <StatCard key={s.label} label={s.label} value={s.value} />
                        ))}
                      </View>
                    )}

                    {!!r.observation && r.status !== 'GENERATED' && (
                      <Text style={{ fontSize: 13, color: colors.gray[600] }}>Observation actuelle : {r.observation}</Text>
                    )}
                    <TextInput
                      value={obs[r.id] ?? r.observation ?? ''}
                      onChangeText={(v) => setObs((p) => ({ ...p, [r.id]: v }))}
                      placeholder="Ajouter une observation..."
                      placeholderTextColor={colors.gray[400]}
                      multiline
                      style={{ minHeight: 80, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.md, fontSize: 14, color: colors.gray[900], textAlignVertical: 'top' }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={update.isPending}
                        onPress={() => update.mutate({ id: r.id, data: { observation: obs[r.id] ?? r.observation ?? '', status: 'AMENDED' } })}
                      >
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        loading={update.isPending}
                        onPress={() => update.mutate({ id: r.id, data: { observation: obs[r.id] ?? r.observation ?? '', status: 'CLOSED' } })}
                      >
                        Cloturer
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </SectionCard>
  );
}

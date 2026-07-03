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

const STATUS = { GENERATED: { v: 'warning' as const, l: 'Genere' }, AMENDED: { v: 'default' as const, l: 'Annote' }, CLOSED: { v: 'success' as const, l: 'Cloture' } };

function reportStats(p: any): { label: string; value: string; color?: string }[] {
  if (!p || typeof p !== 'object') return [];
  const cash = p.cashRegister?.closingBalance ?? p.cashRegister?.currentBalance ?? 0;
  return [
    { label: 'Recettes', value: '+' + formatAmount(Number(p.recetteTotal ?? 0)), color: colors.primary[600] },
    { label: 'Paiements en avance', value: '+' + formatAmount(Number(p.advancesTotal ?? 0)) },
    { label: 'Depenses', value: '-' + formatAmount(Number(p.expensesTotal ?? 0)), color: colors.error },
    { label: 'Solde caisse', value: formatAmount(Number(cash)), color: Number(cash) >= 0 ? colors.primary[700] : colors.error },
  ];
}

/** Tableau generique route -> total (recettes / avances). */
function Breakdown({ title, data, total }: { title: string; data: any[]; total?: number }) {
  const rows: any[] = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>{title}{total != null ? ` — ${formatAmount(Number(total))}` : ''}</Text>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: colors.gray[900] }}>{r.routeName ?? r.route ?? 'Sans route'}</Text>
            {r.methods && <Text style={{ fontSize: 11, color: colors.gray[400] }}>{Object.entries(r.methods as Record<string, number>).map(([m, v]) => `${m}: ${formatAmount(Number(v))}`).join(' · ')}</Text>}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary[700] }}>{formatAmount(Number(r.total ?? 0))}</Text>
        </View>
      ))}
    </View>
  );
}

export function DailyReportsTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyDailyReports(agencyId);
  const { generate, update, email } = useDailyReportMutations(agencyId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [obs, setObs] = useState<Record<string, string>>({});

  const reports: any[] = data?.data ?? data ?? [];

  return (
    <SectionCard title="Rapports journaliers (observations)" subtitle="Synthese financiere + observation par jour" action={<Button size="sm" loading={generate.isPending} onPress={() => generate.mutate(undefined)}>Generer aujourd'hui</Button>}>
      {reports.length === 0 ? (
        <EmptyState text="Aucun rapport" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {reports.map((r) => {
            const isOpen = expanded === r.id;
            const p = r.payload ?? {};
            const st = STATUS[r.status as keyof typeof STATUS] ?? STATUS.GENERATED;
            const entries: any[] = p.entriesByTransitMethod ? Object.values(p.entriesByTransitMethod) : [];
            return (
              <View key={r.id} style={{ borderWidth: 1, borderColor: colors.gray[100], borderRadius: radius.md, overflow: 'hidden' }}>
                <Pressable onPress={() => setExpanded(isOpen ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, backgroundColor: colors.gray[50] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray[500]} />
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{formatDate(r.date)}</Text>
                        <Badge variant={st.v}>{st.l}</Badge>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.gray[400] }}>{p.totalParcels ?? 0} colis recus</Text>
                    </View>
                  </View>
                  {r._count?.attachments > 0 && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r._count.attachments} pieces</Text>}
                </Pressable>

                {isOpen && (
                  <View style={{ padding: spacing.lg, gap: spacing.md }}>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button size="sm" variant="outline" loading={generate.isPending} onPress={() => generate.mutate(r.date)}>Regenerer</Button>
                      <Button size="sm" variant="outline" loading={email.isPending} onPress={() => email.mutate(r.id)}>{r.emailedAt ? 'Renvoyer par mail' : 'Envoyer par mail'}</Button>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      {reportStats(p).map((s) => <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />)}
                    </View>

                    {entries.length > 0 && (
                      <View style={{ gap: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>Entrees du jour par mode de transit</Text>
                        {entries.map((e: any, i: number) => (
                          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, color: colors.gray[900] }}>{e.transitType ?? e.type ?? '-'}</Text>
                              {e.methods && <Text style={{ fontSize: 11, color: colors.gray[400] }}>{Object.entries(e.methods as Record<string, number>).map(([m, v]) => `${m}: ${formatAmount(Number(v))}`).join(' · ')}</Text>}
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary[700] }}>{formatAmount(Number(e.total ?? 0))}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Breakdown title="Recettes (colis arrives a destination)" data={p.recetteByRouteAndMethod} total={p.recetteTotal} />
                    <Breakdown title="Paiements en avance (colis pas encore arrives)" data={p.advancesByRouteAndMethod} total={p.advancesTotal} />

                    {!!r.observation && r.status !== 'GENERATED' && <Text style={{ fontSize: 13, color: colors.gray[600] }}>Observation actuelle : {r.observation}</Text>}
                    <TextInput value={obs[r.id] ?? r.observation ?? ''} onChangeText={(v) => setObs((pr) => ({ ...pr, [r.id]: v }))} placeholder="Ajouter une observation..." placeholderTextColor={colors.gray[400]} multiline style={{ minHeight: 80, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.md, fontSize: 14, color: colors.gray[900], textAlignVertical: 'top' }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                      <Button size="sm" variant="outline" loading={update.isPending} onPress={() => update.mutate({ id: r.id, data: { observation: obs[r.id] ?? r.observation ?? '', status: 'AMENDED' } })}>Enregistrer</Button>
                      <Button size="sm" loading={update.isPending} onPress={() => update.mutate({ id: r.id, data: { observation: obs[r.id] ?? r.observation ?? '', status: 'CLOSED' } })}>Cloturer</Button>
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

import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { SectionCard, EmptyState } from '@/components/data/DetailCards';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { employeesApi } from '@/lib/api/employees';
import { apiClient } from '@/lib/api/client';
import { downloadAndShare } from '@/lib/api/download';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHM = () => new Date().toTimeString().slice(0, 5);
const ATT_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = { PRESENT: 'success', LATE: 'warning', ABSENT: 'error', ON_LEAVE: 'default', HOLIDAY: 'default' };

export function AttendanceTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['employees', id, 'attendance'], queryFn: () => employeesApi.attendance(id), enabled: !!id });
  const rows: any[] = data?.data ?? [];
  const today = rows.find((a) => (a.date ?? '').slice(0, 10) === todayISO());
  const inv = () => qc.invalidateQueries({ queryKey: ['employees', id, 'attendance'] });
  const mark = useMutation({ mutationFn: (d: unknown) => employeesApi.markAttendance(id, d), onSuccess: inv, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const checkout = useMutation({ mutationFn: (d: unknown) => employeesApi.checkOut(id, d), onSuccess: inv, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });

  const columns: Column<any>[] = [
    { key: 'date', label: 'Date', width: 120, render: (a) => <Text style={{ fontSize: 13 }}>{a.date ? formatDate(a.date) : '-'}</Text> },
    { key: 'status', label: 'Statut', width: 110, render: (a) => <Badge variant={ATT_VARIANT[a.status] ?? 'default'}>{a.status}</Badge> },
    { key: 'in', label: 'Arrivee', width: 120, render: (a) => <Text style={{ fontSize: 12 }}>{a.expectedStart ?? '-'} / {a.checkInTime ?? '-'}</Text> },
    { key: 'out', label: 'Depart', width: 120, render: (a) => <Text style={{ fontSize: 12 }}>{a.expectedEnd ?? '-'} / {a.checkOutTime ?? '-'}</Text> },
    { key: 'late', label: 'Retard', width: 90, align: 'right', render: (a) => <Text style={{ fontSize: 12 }}>{a.lateMinutes ? `+${a.lateMinutes}m` : '-'}</Text> },
    { key: 'reason', label: 'Motif', width: 160, render: (a) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{a.reason ?? ''}</Text> },
  ];

  return (
    <SectionCard title="Pointage" subtitle={today ? `Aujourd'hui: ${today.status}` : 'Non pointe aujourd\'hui'}
      action={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button size="sm" disabled={!!today} onPress={() => mark.mutate({ date: todayISO(), status: 'PRESENT', checkInTime: nowHM() })}>Arrivee</Button>
          <Button size="sm" variant="outline" disabled={!today || !!today?.checkOutTime} onPress={() => checkout.mutate({ date: todayISO(), checkOutTime: nowHM() })}>Depart</Button>
          <Button size="sm" variant="destructive" disabled={!!today} onPress={() => mark.mutate({ date: todayISO(), status: 'ABSENT' })}>Absent</Button>
        </View>
      }>
      <AppDataTable columns={columns} data={rows} emptyMessage="Aucun pointage" />
    </SectionCard>
  );
}

const LEAVE_TYPES = [{ v: 'PAID', l: 'Conge paye' }, { v: 'UNPAID', l: 'Sans solde' }, { v: 'SICK', l: 'Maladie' }, { v: 'MATERNITY', l: 'Maternite' }, { v: 'PATERNITY', l: 'Paternite' }, { v: 'EXCEPTIONAL', l: 'Exceptionnel' }];
const LEAVE_VARIANT: Record<string, 'warning' | 'success' | 'error'> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

export function LeavesTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['employees', id, 'leaves'], queryFn: () => employeesApi.leaves(id), enabled: !!id });
  const rows: any[] = data?.data ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['employees', id, 'leaves'] });
  const [type, setType] = useState('PAID');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const create = useMutation({ mutationFn: () => employeesApi.createLeave(id, { type, fromDate: from, toDate: to, reason: reason || undefined }), onSuccess: () => { inv(); setFrom(''); setTo(''); setReason(''); toast.success('Demande creee'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });
  const validate = useMutation({ mutationFn: ({ leaveId, decision }: { leaveId: string; decision: string }) => employeesApi.validateLeave(leaveId, { decision }), onSuccess: inv, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });

  return (
    <SectionCard title={`Conges (${rows.length})`}>
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {LEAVE_TYPES.map((t) => <Pressable key={t.v} onPress={() => setType(t.v)} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: type === t.v ? colors.primary[400] : colors.gray[300], backgroundColor: type === t.v ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 12, color: type === t.v ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Input label="Du (AAAA-MM-JJ)" value={from} onChangeText={setFrom} /></View>
          <View style={{ flex: 1 }}><Input label="Au (AAAA-MM-JJ)" value={to} onChangeText={setTo} /></View>
        </View>
        <Input label="Motif (optionnel)" value={reason} onChangeText={setReason} />
        <Button size="sm" loading={create.isPending} disabled={!from || !to} onPress={() => create.mutate()}>Demander un conge</Button>
      </View>
      {rows.length === 0 ? <EmptyState text="Aucun conge" /> : rows.map((l) => (
        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{LEAVE_TYPES.find((t) => t.v === l.type)?.l ?? l.type}</Text>
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{l.fromDate ? formatDate(l.fromDate) : ''} → {l.toDate ? formatDate(l.toDate) : ''}</Text>
          </View>
          <Badge variant={LEAVE_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
          {l.status === 'PENDING' && <>
            <Pressable onPress={() => validate.mutate({ leaveId: l.id, decision: 'APPROVED' })} hitSlop={6}><Ionicons name="checkmark-circle" size={20} color={colors.primary[600]} /></Pressable>
            <Pressable onPress={() => validate.mutate({ leaveId: l.id, decision: 'REJECTED' })} hitSlop={6}><Ionicons name="close-circle" size={20} color={colors.error} /></Pressable>
          </>}
        </View>
      ))}
    </SectionCard>
  );
}

export function PayslipsTab({ id, name }: { id: string; name: string }) {
  const { data } = useQuery({ queryKey: ['employees', id, 'payslips'], queryFn: () => employeesApi.payslips(id), enabled: !!id });
  const rows: any[] = data?.data ?? [];
  const columns: Column<any>[] = [
    { key: 'period', label: 'Periode', width: 110 },
    { key: 'status', label: 'Statut', width: 110, render: (p) => <Badge variant={p.isPaid ? 'success' : Number(p.paidAmount ?? 0) > 0 ? 'warning' : 'default'}>{p.isPaid ? 'Solde' : Number(p.paidAmount ?? 0) > 0 ? 'Partiel' : 'Emis'}</Badge> },
    { key: 'grossSalary', label: 'Brut', width: 120, align: 'right', render: (p) => <Text style={{ fontSize: 13 }}>{formatAmount(Number(p.grossSalary ?? 0))}</Text> },
    { key: 'netSalary', label: 'Net', width: 120, align: 'right', render: (p) => <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatAmount(Number(p.netSalary ?? 0))}</Text> },
    { key: 'paidAmount', label: 'Verse', width: 120, align: 'right', render: (p) => <Text style={{ fontSize: 13, color: colors.primary[700] }}>{formatAmount(Number(p.paidAmount ?? 0))}</Text> },
    { key: 'pdf', label: '', width: 60, align: 'center', render: (p) => <Pressable onPress={() => downloadAndShare(`/employees/payslips/${p.id}/pdf`, `bulletin-${p.period}-${name}`, 'pdf')} hitSlop={6}><Ionicons name="download-outline" size={18} color={colors.primary[600]} /></Pressable> },
  ];
  return <SectionCard title={`Bulletins (${rows.length})`}><AppDataTable columns={columns} data={rows} emptyMessage="Aucun bulletin" /></SectionCard>;
}

const DOC_TYPES = [{ v: 'DIPLOMA', l: 'Diplome' }, { v: 'CV', l: 'CV' }, { v: 'CONTRACT', l: 'Contrat' }, { v: 'ID_DOCUMENT', l: 'Identite' }, { v: 'CERTIFICATE', l: 'Certificat' }, { v: 'OTHER', l: 'Autre' }];

export function DocumentsTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['employees', id, 'documents'], queryFn: () => employeesApi.documents(id), enabled: !!id });
  const rows: any[] = data?.data ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['employees', id, 'documents'] });
  const [type, setType] = useState('OTHER');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const del = useMutation({ mutationFn: (docId: string) => employeesApi.deleteDocument(docId), onSuccess: inv });

  const pickAndUpload = async () => {
    if (!label.trim()) { toast.error('Libelle requis'); return; }
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' } as never);
      const up = await apiClient.post('/uploads/file', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
      const u = up?.data ?? up;
      await employeesApi.createDocument(id, { type, label, url: u.url, storageKey: u.key, contentType: a.mimeType, size: a.size });
      inv(); setLabel(''); toast.success('Document ajoute');
    } catch (e) { toast.error(extractApiError(e, 'Erreur')); } finally { setBusy(false); }
  };

  return (
    <SectionCard title={`Documents (${rows.length})`}>
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {DOC_TYPES.map((t) => <Pressable key={t.v} onPress={() => setType(t.v)} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: type === t.v ? colors.primary[400] : colors.gray[300], backgroundColor: type === t.v ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 12, color: type === t.v ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Input label="Libelle" value={label} onChangeText={setLabel} /></View>
          <Button size="sm" loading={busy} onPress={pickAndUpload}>Ajouter</Button>
        </View>
      </View>
      {rows.length === 0 ? <EmptyState text="Aucun document" /> : rows.map((d) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <Ionicons name="document-outline" size={18} color={colors.gray[600]} />
          <View style={{ flex: 1 }}><Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{d.label}</Text><Text style={{ fontSize: 11, color: colors.gray[400] }}>{DOC_TYPES.find((t) => t.v === d.type)?.l ?? d.type}</Text></View>
          <Pressable onPress={() => del.mutate(d.id)} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
        </View>
      ))}
    </SectionCard>
  );
}

const SANCTION_TYPES = [{ v: 'WARNING', l: 'Avertissement' }, { v: 'SUSPENSION', l: 'Suspension' }, { v: 'PAY_FREEZE', l: 'Gel de salaire' }, { v: 'DEMOTION', l: 'Retrogradation' }];

export function DisciplineTab({ id, isActive }: { id: string; isActive: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['employees', id, 'sanctions'], queryFn: () => employeesApi.sanctions(id), enabled: !!id });
  const rows: any[] = data?.data ?? [];
  const inv = () => qc.invalidateQueries({ queryKey: ['employees', id, 'sanctions'] });
  const [type, setType] = useState('WARNING');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const create = useMutation({ mutationFn: () => employeesApi.createSanction(id, { type, reason, effectiveFrom: from || todayISO() }), onSuccess: () => { inv(); setReason(''); setFrom(''); toast.success('Sanction enregistree'); }, onError: (e) => toast.error(extractApiError(e, 'Erreur')) });

  return (
    <SectionCard title={`Discipline (${rows.length})`}>
      {isActive && (
        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {SANCTION_TYPES.map((t) => <Pressable key={t.v} onPress={() => setType(t.v)} style={{ paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: type === t.v ? colors.primary[400] : colors.gray[300], backgroundColor: type === t.v ? colors.primary[50] : colors.white }}><Text style={{ fontSize: 12, color: type === t.v ? colors.primary[700] : colors.gray[600] }}>{t.l}</Text></Pressable>)}
          </View>
          <Input label="Motif" value={reason} onChangeText={setReason} multiline />
          <Input label="Date d'effet (AAAA-MM-JJ, vide=auj.)" value={from} onChangeText={setFrom} />
          <Button size="sm" variant="destructive" loading={create.isPending} disabled={reason.trim().length < 2} onPress={() => create.mutate()}>Enregistrer la sanction</Button>
        </View>
      )}
      {rows.length === 0 ? <EmptyState text="Aucune sanction" /> : rows.map((s) => (
        <View key={s.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Badge variant="warning">{SANCTION_TYPES.find((t) => t.v === s.type)?.l ?? s.type}</Badge>
            <Text style={{ fontSize: 12, color: colors.gray[400] }}>{s.effectiveFrom ? formatDate(s.effectiveFrom) : ''}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.gray[700], marginTop: 2 }}>{s.reason}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

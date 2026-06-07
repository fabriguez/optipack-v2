import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { apiClient } from '@/lib/api/client';
import { notificationsApi } from '@/lib/api/notifications';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

/** Barre superieure globale (mirror web TopBar) : recherche + notifications + menu utilisateur. */
export function TopBar() {
  return (
    <View
      style={{
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.gray[200],
        paddingHorizontal: spacing.xl,
        zIndex: 100,
      }}
    >
      <GlobalSearch />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <NotificationBell />
        <UserMenu />
      </View>
    </View>
  );
}

function NotificationBell() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30_000,
  });
  const unread = (data?.count ?? data?.data?.count ?? 0) as number;

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.gray[600]} />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.white }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const name = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Utilisateur';
  const email = user?.email ?? '';
  const initials = (name || email).slice(0, 2).toUpperCase();

  const go = (path: string) => {
    setOpen(false);
    router.push(path as never);
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md, backgroundColor: pressed ? colors.gray[100] : 'transparent' })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary[100], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>{initials}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }} numberOfLines={1}>{name}</Text>
          {!!email && <Text style={{ fontSize: 11, color: colors.gray[500] }} numberOfLines={1}>{email}</Text>}
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.gray[400]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }} onPress={() => setOpen(false)}>
          <View style={{ position: 'absolute', top: 60, right: spacing.xl, width: 220, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: spacing.sm, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 }}>
            <MenuItem icon="settings-outline" label="Parametres" onPress={() => go('/settings')} />
            <MenuItem icon="notifications-outline" label="Notifications" onPress={() => go('/notifications')} />
            <View style={{ height: 1, backgroundColor: colors.gray[100], marginVertical: 4 }} />
            <MenuItem icon="log-out-outline" label="Deconnexion" destructive onPress={() => { setOpen(false); logout(); }} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, label, onPress, destructive }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: pressed ? colors.gray[50] : 'transparent' })}
    >
      <Ionicons name={icon} size={18} color={destructive ? colors.error : colors.gray[600]} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: destructive ? colors.error : colors.gray[800] }}>{label}</Text>
    </Pressable>
  );
}

interface SearchResults {
  parcels?: any[];
  clients?: any[];
  containers?: any[];
  invoices?: any[];
}

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/search', { params: { q: query } });
        setResults(data?.data ?? data ?? null);
        setOpen(true);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const goto = (path: string) => {
    router.push(path as never);
    setOpen(false);
    setQuery('');
  };

  const hasResults = !!results && [(results.parcels?.length ?? 0), (results.clients?.length ?? 0), (results.containers?.length ?? 0), (results.invoices?.length ?? 0)].some((n) => n > 0);

  return (
    <View style={{ flex: 1, maxWidth: 520, zIndex: 200 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50], paddingHorizontal: spacing.md }}>
        <Ionicons name="search" size={18} color={colors.gray[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => results && setOpen(true)}
          placeholder="Rechercher colis, client, conteneur, facture..."
          placeholderTextColor={colors.gray[400]}
          style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.gray[400]} />
        ) : query.length > 0 ? (
          <Pressable onPress={() => { setQuery(''); setOpen(false); }} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
          </Pressable>
        ) : null}
      </View>

      {open && (
        <View style={{ position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, maxHeight: 360, overflow: 'hidden' }}>
          {!hasResults ? (
            <Text style={{ paddingVertical: 24, textAlign: 'center', fontSize: 13, color: colors.gray[400] }}>Aucun resultat pour "{query}"</Text>
          ) : (
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <ResultSection title="Colis" icon="cube-outline" items={results?.parcels} render={(p) => `${p.trackingNumber ?? ''}  ${p.designation ?? ''}`} onSelect={(p) => goto(`/parcels/${p.id}`)} />
              <ResultSection title="Clients" icon="people-outline" items={results?.clients} render={(c) => `${c.fullName ?? ''}  ${c.phone ?? ''}`} onSelect={(c) => goto(`/clients/${c.id}`)} />
              <ResultSection title="Conteneurs" icon="cube-outline" items={results?.containers} render={(c) => c.designation ?? c.reference ?? ''} onSelect={(c) => goto(`/containers/${c.id}`)} />
              <ResultSection title="Factures" icon="document-text-outline" items={results?.invoices} render={(i) => i.reference ?? ''} onSelect={(i) => goto(`/invoices/${i.id}`)} />
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function ResultSection({ title, icon, items, render, onSelect }: { title: string; icon: keyof typeof Ionicons.glyphMap; items?: any[]; render: (item: any) => string; onSelect: (item: any) => void }) {
  if (!items?.length) return null;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: colors.gray[50], borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
        <Ionicons name={icon} size={14} color={colors.gray[500]} />
        <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[500] }}>{title}</Text>
        <Text style={{ marginLeft: 'auto', fontSize: 11, color: colors.gray[400] }}>{items.length}</Text>
      </View>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => onSelect(item)} style={({ pressed }) => ({ paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: pressed ? colors.primary[50] : 'transparent' })}>
          <Text style={{ fontSize: 13, color: colors.gray[800] }} numberOfLines={1}>{render(item)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

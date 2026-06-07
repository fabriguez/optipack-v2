import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { useSidebar } from '@/lib/sidebar/SidebarContext';
import { offlineQueue } from '@/lib/api/offlineQueue';
import { drainOnce } from '@/lib/api/offlineDrain';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

type State = 'offline' | 'pending' | 'online';

const VISUAL: Record<State, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  offline: { color: colors.error, bg: '#FFEBEE', icon: 'cloud-offline-outline', label: 'Hors ligne' },
  pending: { color: colors.warning, bg: '#FFF3E0', icon: 'cloud-upload-outline', label: 'En attente' },
  online: { color: colors.primary[600], bg: colors.primary[50], icon: 'cloud-done-outline', label: 'En ligne' },
};

/**
 * Badge de connectivite dans la sidebar. Replie -> icone seule. Tap -> dialogue
 * avec la file hors-ligne + actions (Synchroniser / Abandonner), comme le
 * backoffice web (OfflineIndicator).
 */
export function ConnectivityBadge() {
  const online = useOnlineStatus();
  const { pending, entries } = useOfflineQueue();
  const { collapsed } = useSidebar();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draining, setDraining] = useState(false);

  const state: State = !online ? 'offline' : pending > 0 ? 'pending' : 'online';
  const v = VISUAL[state];

  const onSync = async () => {
    if (!online) {
      toast.error('Toujours hors ligne, synchronisation impossible');
      return;
    }
    setDraining(true);
    try {
      await drainOnce();
      qc.invalidateQueries();
      toast.success('Synchronisation effectuee');
    } finally {
      setDraining(false);
    }
  };

  const onClear = () => {
    if (pending === 0) return;
    Alert.alert('Abandonner', `Abandonner ${pending} action(s) en attente ? Les changements seront perdus.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Abandonner',
        style: 'destructive',
        onPress: async () => {
          await offlineQueue.clear();
          toast.info('File hors-ligne videe');
        },
      },
    ]);
  };

  return (
    <>
      {collapsed ? (
        <Pressable
          onPress={() => setOpen(true)}
          style={{ alignSelf: 'center', width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: spacing.sm }}
        >
          <Ionicons name={v.icon} size={20} color={colors.white} />
          {pending > 0 && (
            <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.white }}>{pending}</Text>
            </View>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginVertical: spacing.sm, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <Ionicons name={v.icon} size={16} color={colors.white} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.white }} numberOfLines={1}>
            {v.label}
            {pending > 0 ? ` (${pending})` : ''}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.sidebar.muted} />
        </Pressable>
      )}

      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        title={state === 'offline' ? 'Mode hors ligne actif' : 'File de synchronisation'}
        description={
          state === 'offline'
            ? 'Vos actions seront renvoyees automatiquement au retour de la connexion.'
            : 'Synchronisez manuellement les actions en attente.'
        }
        width={480}
        footer={
          <>
            {pending > 0 && (
              <Button variant="ghost" onPress={onClear}>Abandonner</Button>
            )}
            <Button onPress={onSync} loading={draining} disabled={!online || pending === 0}>
              Synchroniser
            </Button>
          </>
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: v.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={v.icon} size={18} color={v.color} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: v.color }}>
            {v.label}{pending > 0 ? ` - ${pending} action(s)` : ''}
          </Text>
        </View>

        {pending > 0 && (
          <ScrollView style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.gray[100], borderRadius: radius.md, backgroundColor: colors.gray[50] }} nestedScrollEnabled>
            {entries.slice(0, 20).map((e) => (
              <View key={e.id} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '700', color: colors.gray[800] }}>{e.method}</Text>
                  <Text style={{ fontSize: 11, color: colors.gray[400] }}>{new Date(e.ts).toLocaleTimeString()}</Text>
                </View>
                <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.gray[600] }} numberOfLines={1}>{e.url}</Text>
                {e.attempts > 0 && (
                  <Text style={{ fontSize: 11, color: colors.warning }}>
                    {e.attempts} essai(s){e.lastError ? ` : ${e.lastError.slice(0, 40)}` : ''}
                  </Text>
                )}
              </View>
            ))}
            {entries.length > 20 && (
              <Text style={{ textAlign: 'center', fontSize: 11, color: colors.gray[400], paddingVertical: spacing.sm }}>
                + {entries.length - 20} autres...
              </Text>
            )}
          </ScrollView>
        )}
      </AppDialog>
    </>
  );
}

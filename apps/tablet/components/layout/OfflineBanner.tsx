import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { pending } = useOfflineQueue();
  if (online && pending === 0) return null;
  const offline = !online;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: offline ? colors.warning : colors.info,
      }}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'cloud-upload-outline'}
        size={16}
        color={colors.white}
      />
      <Text style={{ color: colors.white, fontSize: 12, fontWeight: '600' }}>
        {offline ? 'Hors ligne' : 'En ligne'}
        {pending > 0 ? ` - ${pending} action${pending > 1 ? 's' : ''} en attente` : ''}
      </Text>
    </View>
  );
}

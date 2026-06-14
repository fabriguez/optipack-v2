import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StreamChat, type Channel as ChannelType } from 'stream-chat';
import {
  Chat,
  Channel,
  MessageList,
  MessageInput,
  OverlayProvider,
} from 'stream-chat-expo';
import { portalApi } from '@/lib/api/portal';
import { colors, spacing } from '@/lib/theme/colors';

/**
 * Support client temps reel via Stream Chat. Recupere un token cote API
 * (POST /client-portal/support/token), connecte l'utilisateur Stream et ouvre
 * son channel support unique. Les agents repondent depuis le backoffice.
 */
export default function SupportScreen() {
  const router = useRouter();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let chatClient: StreamChat | null = null;

    (async () => {
      try {
        const { data } = await portalApi.supportToken();
        if (!data?.apiKey) {
          throw new Error('Support indisponible (configuration manquante).');
        }
        chatClient = StreamChat.getInstance(data.apiKey);
        // Evite une double connexion si l'instance est deja connectee.
        if (chatClient.userID !== data.userId) {
          await chatClient.connectUser({ id: data.userId }, data.token);
        }
        const ch = chatClient.channel('messaging', data.channelId);
        await ch.watch();
        if (!active) return;
        setClient(chatClient);
        setChannel(ch);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e as Error)?.message ??
          'Impossible de joindre le support.';
        if (active) setError(msg);
      }
    })();

    return () => {
      active = false;
      // Deconnecte proprement pour liberer la connexion realtime.
      chatClient?.disconnectUser();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomColor: colors.gray[100],
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>
          Support client
        </Text>
      </View>

      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.gray[300]} />
          <Text style={{ marginTop: 12, fontSize: 14, color: colors.gray[600], textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      ) : !client || !channel ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <OverlayProvider>
          <Chat client={client}>
            <Channel channel={channel}>
              <MessageList />
              <MessageInput />
            </Channel>
          </Chat>
        </OverlayProvider>
      )}
    </View>
  );
}

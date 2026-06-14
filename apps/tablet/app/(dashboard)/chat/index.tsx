import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  StreamChat,
  type Channel as ChannelType,
  type ChannelFilters,
  type ChannelSort,
} from 'stream-chat';
import {
  OverlayProvider,
  Chat,
  ChannelList,
  Channel,
  MessageList,
  MessageInput,
  Thread,
  type ThreadContextValue,
} from 'stream-chat-expo';
import { chatApi } from '@/lib/api/chat';
import { colors } from '@/lib/theme/colors';

/**
 * Support backoffice via Stream Chat. L'agent (role admin) se connecte et voit
 * tous les channels support de SES agences (filtre custom `agency_id`). Le chat
 * Prisma historique est remplace par ce flux temps reel.
 */
export default function ChatScreen() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [filters, setFilters] = useState<ChannelFilters | null>(null);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [thread, setThread] = useState<ThreadContextValue['thread']>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let chatClient: StreamChat | null = null;

    (async () => {
      try {
        const { data } = await chatApi.streamToken();
        if (!data?.apiKey) throw new Error('Support indisponible (configuration manquante).');
        chatClient = StreamChat.getInstance(data.apiKey);
        if (chatClient.userID !== data.userId) {
          await chatClient.connectUser({ id: data.userId }, data.token);
        }
        if (!active) return;
        setClient(chatClient);
        // Filtre type:'messaging' uniquement. Les champs custom is_support/agency_id
        // ne sont pas indexes par defaut sur Stream -> retournent rien. Le role admin
        // Stream permet de voir tous les channels messaging.
        setFilters({ type: 'messaging' });
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
      chatClient?.disconnectUser();
    };
  }, []);

  const sort: ChannelSort = { last_message_at: -1 };

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.gray[300]} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.gray[600], textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!client || !filters) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={client}>
        {channel ? (
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.gray[100],
              }}
            >
              <Pressable
                onPress={() => {
                  setChannel(null);
                  setThread(null);
                }}
                hitSlop={10}
              >
                <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
              </Pressable>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>
                {(channel.data?.client_name as string) ?? 'Conversation'}
              </Text>
            </View>
            <Channel channel={channel} thread={thread} threadList={!!thread}>
              {thread ? (
                <Thread />
              ) : (
                <>
                  <MessageList onThreadSelect={(t) => setThread(t)} />
                  <MessageInput />
                </>
              )}
            </Channel>
          </View>
        ) : (
          <ChannelList filters={filters} sort={sort} onSelect={(ch) => setChannel(ch)} />
        )}
      </Chat>
    </OverlayProvider>
  );
}

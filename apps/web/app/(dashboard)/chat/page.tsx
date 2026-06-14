'use client';

import { useEffect, useState } from 'react';
import { StreamChat, type Channel as ChannelType, type ChannelFilters, type ChannelSort } from 'stream-chat';
import {
  Chat,
  Channel,
  ChannelHeader,
  ChannelList,
  MessageComposer,
  MessageList,
  Thread,
  Window,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/index.css';
import { chatApi } from '@/lib/api/chat';
import { PageTransition } from '@/components/shared/PageTransition';
import { Loader2, MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [filters, setFilters] = useState<ChannelFilters | null>(null);
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
        // Filtre sur champs custom (is_support, agency_id) necessite indexation
        // sur le dashboard Stream. On utilise type:'messaging' et le role admin
        // Stream qui donne acces a tous les channels du type.
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

  return (
    <PageTransition>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
          <p className="text-sm text-gray-500 mt-1">
            Communication en temps reel avec les clients.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden" style={{ height: '75vh' }}>
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <MessageSquare className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : !client || !filters ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <Chat client={client} theme="str-chat__theme-light">
              <div className="flex h-full">
                <div className="w-72 border-r border-gray-200 shrink-0 overflow-hidden">
                  <ChannelList
                    filters={filters}
                    sort={sort}
                    showChannelSearch
                  />
                </div>
                <div className="flex-1 overflow-hidden">
                  <Channel>
                    <Window>
                      <ChannelHeader />
                      <MessageList />
                      <MessageComposer />
                    </Window>
                    <Thread />
                  </Channel>
                </div>
              </div>
            </Chat>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageComposer,
  Thread,
} from 'stream-chat-react';
import { StreamChat, type Channel as ChannelType } from 'stream-chat';
import 'stream-chat-react/dist/css/index.css';
import { AppCard } from '@/components/ui/AppCard';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

/**
 * Support client temps reel via Stream Chat. Recupere un token cote API
 * (POST /client-portal/support/token), connecte l'utilisateur Stream et ouvre
 * son channel support unique. Les agents repondent depuis le backoffice.
 */
export default function PortalSupportPage() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let chatClient: StreamChat | null = null;

    (async () => {
      try {
        const { data } = await clientPortalApi.supportToken();
        if (!data?.apiKey) throw new Error('Support indisponible (configuration manquante).');
        chatClient = StreamChat.getInstance(data.apiKey);
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
      chatClient?.disconnectUser();
    };
  }, []);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
          <p className="mt-1 text-sm text-gray-500">
            Echangez en direct avec votre agence pour toute question.
          </p>
        </div>

        {error ? (
          <AppCard className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageCircle className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">{error}</p>
          </AppCard>
        ) : !client || !channel ? (
          <AppSkeleton className="h-[600px] rounded-2xl" />
        ) : (
          <div className="h-[600px] overflow-hidden rounded-2xl border border-gray-100">
            <Chat client={client} theme="str-chat__theme-light">
              <Channel channel={channel}>
                <Window>
                  <MessageList />
                  <MessageComposer />
                </Window>
                <Thread />
              </Channel>
            </Chat>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

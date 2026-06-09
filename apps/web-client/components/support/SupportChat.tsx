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
import { portalApi } from '@/lib/api/client';

/**
 * Chat support Stream reutilisable (bulle flottante). Gere la connexion Stream
 * du client et l'ouverture de son channel support unique. Une seule instance
 * StreamChat partagee par apiKey (getInstance) -> pas de double connexion.
 */
export function SupportChat() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let chatClient: StreamChat | null = null;

    (async () => {
      try {
        const data = await portalApi.supportToken();
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
      // Pas de disconnectUser : l'instance est partagee. La connexion se ferme
      // a la fermeture de l'onglet.
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageCircle className="h-10 w-10 text-gray-300" />
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (!client || !channel) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--skin-primary)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <Chat client={client} theme="str-chat__theme-light">
      <Channel channel={channel}>
        <Window>
          <MessageList />
          <MessageComposer />
        </Window>
        <Thread />
      </Channel>
    </Chat>
  );
}

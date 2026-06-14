import { useEffect, useRef, useState } from 'react';
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
  useChatContext,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/index.css';
import { chatApi } from '@/lib/api/chat';
import { clientsApi } from '@/lib/api/clients';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppButton } from '@/components/ui/AppButton';
import { Loader2, MessageSquare, Plus, Search } from 'lucide-react';

function OpenWithClientDialog({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  onOpened: (channelId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; fullName: string; phone: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    clientsApi
      .list({ search: search || undefined, limit: 20 })
      .then((r) => setClients(r?.data ?? []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [open, search]);

  async function handleOpen(clientId: string) {
    setOpening(clientId);
    try {
      const { data } = await chatApi.openWithClient(clientId);
      onOpened(data.channelId);
      onClose();
    } catch {
      /* ignore */
    } finally {
      setOpening(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Contacter un client</h2>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
            </div>
          ) : clients.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun client trouve</p>
          ) : (
            clients.map((c) => (
              <button
                key={c.id}
                onClick={() => handleOpen(c.id)}
                disabled={!!opening}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{c.fullName}</p>
                  <p className="text-xs text-gray-400">{c.phone}</p>
                </div>
                {opening === c.id && <Loader2 className="h-4 w-4 animate-spin text-primary-500" />}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <AppButton variant="outline" size="sm" onClick={onClose}>
            Annuler
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function ChatContent({
  filters,
  sort,
  pendingChannelId,
  onChannelOpened,
}: {
  filters: ChannelFilters;
  sort: ChannelSort;
  pendingChannelId: string | null;
  onChannelOpened: () => void;
}) {
  const { client, setActiveChannel } = useChatContext();
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingChannelId || openedRef.current === pendingChannelId) return;
    openedRef.current = pendingChannelId;
    const ch = client.channel('messaging', pendingChannelId);
    ch.watch().then(() => {
      setActiveChannel(ch as ChannelType);
      onChannelOpened();
    });
  }, [pendingChannelId, client, setActiveChannel, onChannelOpened]);

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-gray-200 shrink-0 overflow-hidden">
        <ChannelList filters={filters} sort={sort} showChannelSearch />
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
  );
}

export default function ChatPage() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [filters, setFilters] = useState<ChannelFilters | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);

  const sort: ChannelSort = { last_message_at: -1 };

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

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
            <p className="text-sm text-gray-500 mt-1">Communication en temps reel avec les clients.</p>
          </div>
          {client && (
            <AppButton size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Contacter un client
            </AppButton>
          )}
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
              <ChatContent
                filters={filters}
                sort={sort}
                pendingChannelId={pendingChannelId}
                onChannelOpened={() => setPendingChannelId(null)}
              />
            </Chat>
          )}
        </div>
      </div>

      <OpenWithClientDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onOpened={(id) => {
          setPendingChannelId(id);
          setDialogOpen(false);
        }}
      />
    </PageTransition>
  );
}

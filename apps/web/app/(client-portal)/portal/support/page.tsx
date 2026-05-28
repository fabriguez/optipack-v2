'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageCircle,
  Send,
  Plus,
  User as UserIcon,
  Headphones,
} from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  agency: { id: string; name: string } | null;
  assignedUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  messages: Array<{
    id: string;
    message: string;
    senderType: string;
    isRead: boolean;
    createdAt: string;
  }>;
  _count: { messages: number };
}

interface Message {
  id: string;
  message: string;
  senderType: string;
  createdAt: string;
  senderUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  senderClient: { id: string; fullName: string } | null;
}

function formatRel(d: string) {
  const date = new Date(d);
  return date.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PortalSupportPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await clientPortalApi.getConversations();
      const list: Conversation[] = res.data ?? [];
      setConversations(list);
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, [activeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const res = await clientPortalApi.getConversationMessages(id);
      setMessages(res.data ?? []);
      await clientPortalApi.markConversationRead(id).catch(() => {});
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;
    setSending(true);
    try {
      await clientPortalApi.sendConversationMessage(activeId, draft.trim());
      setDraft('');
      await loadMessages(activeId);
      refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleNewConversation() {
    setCreating(true);
    try {
      const res = await clientPortalApi.createConversation({});
      const created: Conversation = res.data;
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
    } finally {
      setCreating(false);
    }
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messagerie</h1>
            <p className="mt-1 text-sm text-gray-500">
              Echangez avec votre agence pour toute question.
            </p>
          </div>
          <AppButton onClick={handleNewConversation} loading={creating}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle discussion
          </AppButton>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Liste */}
          <AppCard className="h-fit">
            <AppCardHeader title="Conversations" />
            {loadingList ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <AppSkeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <MessageCircle className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-400">
                  Aucune conversation. Cliquez sur &quot;Nouvelle discussion&quot;.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((c) => {
                  const lastMsg = c.messages[0];
                  const isActive = c.id === activeId;
                  const unreadCount = (c._count?.messages ?? 0);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-primary-50 ring-1 ring-primary-100'
                          : 'hover:bg-gray-50',
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                        <Headphones className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {c.agency?.name ?? 'Support'}
                          </p>
                          {unreadCount > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                              {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-gray-500">
                          {lastMsg?.message ?? 'Aucun message'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {c.status === 'OPEN' ? 'Ouverte' : 'Fermee'} -{' '}
                          {formatRel(c.createdAt)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </AppCard>

          {/* Fil de messages */}
          <AppCard className="flex h-[600px] flex-col">
            {!active ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-gray-400">
                  Selectionnez ou creez une conversation.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {active.agency?.name ?? 'Support'}
                    </p>
                    {active.assignedUser && (
                      <p className="text-xs text-gray-500">
                        Agent :{' '}
                        {[
                          active.assignedUser.firstName,
                          active.assignedUser.lastName,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      active.status === 'OPEN'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {active.status === 'OPEN' ? 'Ouverte' : 'Fermee'}
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto py-3">
                  {loadingMessages ? (
                    <AppSkeleton className="h-40 rounded-xl" />
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      Aucun message. Ecrivez le premier.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isClient = m.senderType === 'CLIENT';
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex gap-2',
                            isClient ? 'justify-end' : 'justify-start',
                          )}
                        >
                          {!isClient && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                              <Headphones className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <div
                            className={cn(
                              'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                              isClient
                                ? 'rounded-br-sm bg-primary-600 text-white'
                                : 'rounded-bl-sm bg-gray-100 text-gray-900',
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">
                              {m.message}
                            </p>
                            <p
                              className={cn(
                                'mt-1 text-[10px]',
                                isClient ? 'text-primary-100' : 'text-gray-500',
                              )}
                            >
                              {formatRel(m.createdAt)}
                            </p>
                          </div>
                          {isClient && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                              <UserIcon className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSend}
                  className="flex items-end gap-2 border-t border-gray-100 pt-3"
                >
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e as unknown as React.FormEvent);
                      }
                    }}
                    disabled={active.status === 'CLOSED'}
                    placeholder={
                      active.status === 'CLOSED'
                        ? 'Conversation fermee'
                        : 'Ecrire un message... (Entree = envoyer)'
                    }
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50"
                  />
                  <AppButton
                    type="submit"
                    loading={sending}
                    disabled={!draft.trim() || active.status === 'CLOSED'}
                  >
                    <Send className="h-4 w-4" />
                  </AppButton>
                </form>
              </>
            )}
          </AppCard>
        </div>
      </div>
    </PageTransition>
  );
}

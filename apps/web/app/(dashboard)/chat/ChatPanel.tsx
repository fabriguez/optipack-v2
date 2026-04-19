'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { formatDateTime } from '@transitsoftservices/shared';
import {
  useConversation,
  useMessages,
  useSendMessage,
  useCloseConversation,
  useMarkRead,
} from '@/lib/hooks/useChat';
import type { ChatMessage } from '@/lib/api/chat';

interface ChatPanelProps {
  conversationId: string | null;
  onConversationClosed: () => void;
}

function MessageBubble({ msg, isAgent }: { msg: ChatMessage; isAgent: boolean }) {
  return (
    <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isAgent
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {!isAgent && msg.senderUser && (
          <p className="text-xs font-medium text-gray-500 mb-1">
            {msg.senderUser.firstName} {msg.senderUser.lastName}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
        <p
          className={`text-[10px] mt-1 ${
            isAgent ? 'text-primary-100' : 'text-gray-400'
          }`}
        >
          {formatDateTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function ChatPanel({ conversationId, onConversationClosed }: ChatPanelProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convData } = useConversation(conversationId);
  const { data: messagesData, isLoading: messagesLoading } = useMessages(conversationId, {
    limit: 100,
    page: 1,
  });
  const sendMutation = useSendMessage();
  const closeMutation = useCloseConversation();
  const markReadMutation = useMarkRead();

  const conversation = convData?.data;
  const messages: ChatMessage[] = messagesData?.data || [];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark messages as read when opening a conversation
  useEffect(() => {
    if (conversationId) {
      markReadMutation.mutate(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSend = () => {
    const trimmed = messageText.trim();
    if (!trimmed || !conversationId) return;
    sendMutation.mutate(
      { conversationId, message: trimmed },
      { onSuccess: () => setMessageText('') },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    if (!conversationId) return;
    closeMutation.mutate(conversationId, {
      onSuccess: () => onConversationClosed(),
    });
  };

  // Empty state
  if (!conversationId) {
    return (
      <AppCard className="flex flex-col h-full" padding="sm">
        <div className="flex flex-1 items-center justify-center min-h-[400px]">
          <div className="text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">
              Selectionnez une conversation ou creez-en une nouvelle
            </p>
          </div>
        </div>
      </AppCard>
    );
  }

  return (
    <AppCard className="flex flex-col h-full" padding="sm">
      {/* Header */}
      {conversation && (
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {conversation.client.fullName}
              </h3>
              <AppBadge variant={conversation.status === 'OPEN' ? 'success' : 'default'}>
                {conversation.status === 'OPEN' ? 'Ouvert' : 'Ferme'}
              </AppBadge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {conversation.agency.name} -- {conversation.client.phone}
            </p>
          </div>
          {conversation.status === 'OPEN' && (
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleClose}
              loading={closeMutation.isPending}
            >
              <X className="h-4 w-4" />
              Fermer
            </AppButton>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-[350px] max-h-[55vh] px-1">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Aucun message dans cette conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isAgent={msg.senderType === 'USER' && msg.senderId === userId}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {conversation?.status === 'OPEN' && (
        <div className="border-t border-gray-100 pt-3 mt-3">
          <div className="flex items-end gap-2">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ecrivez votre message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm
                focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
                placeholder:text-gray-400"
            />
            <AppButton
              onClick={handleSend}
              disabled={!messageText.trim()}
              loading={sendMutation.isPending}
              size="md"
            >
              <Send className="h-4 w-4" />
            </AppButton>
          </div>
        </div>
      )}

      {conversation?.status === 'CLOSED' && (
        <div className="border-t border-gray-100 pt-3 mt-3 text-center">
          <p className="text-sm text-gray-400">Cette conversation est fermee</p>
        </div>
      )}
    </AppCard>
  );
}

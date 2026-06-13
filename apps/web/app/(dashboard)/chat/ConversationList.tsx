'use client';

import { MessageSquare, Plus, Search } from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';
import { MaskedValue, isMasked } from '@/components/ui/MaskedValue';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import type { ChatConversation } from '@/lib/api/chat';

interface ConversationListProps {
  conversations: ChatConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  isLoading,
  search,
  onSearchChange,
}: ConversationListProps) {
  return (
    <AppCard padding="sm" className="flex flex-col h-full">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Conversations</h2>
          <AppButton size="sm" onClick={onNewConversation}>
            <Plus className="h-4 w-4" />
            Nouvelle
          </AppButton>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <AppInput
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <AppSkeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <MessageSquare className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-400">Aucune conversation</p>
            <p className="text-xs text-gray-300 mt-1">Les conversations apparaitront ici.</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full rounded-xl p-3 text-left transition-colors ${
                selectedId === conv.id
                  ? 'bg-primary-50 border border-primary-200'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {isMasked(conv.client) ? <MaskedValue value={conv.client} /> : conv.client.fullName}
                </p>
                <AppBadge variant={conv.status === 'OPEN' ? 'success' : 'default'}>
                  {conv.status === 'OPEN' ? 'Ouvert' : 'Ferme'}
                </AppBadge>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {conv.agency.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {conv._count.messages} message{conv._count.messages !== 1 ? 's' : ''}
              </p>
            </button>
          ))
        )}
      </div>
    </AppCard>
  );
}

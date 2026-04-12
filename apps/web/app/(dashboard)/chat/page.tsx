'use client';

import { useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useQuery } from '@tanstack/react-query';

export default function ChatPage() {
  const [selectedConv, setSelectedConv] = useState<string | null>(null);

  // TODO: API /chat/conversations a implementer
  const { data } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => Promise.resolve({ data: [] }),
  });

  const conversations = data?.data || [];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
          <p className="text-sm text-gray-500 mt-1">Communication en temps reel avec les clients.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" style={{ minHeight: '60vh' }}>
          {/* Conversation list */}
          <AppCard padding="sm">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <MessageSquare className="h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-400">Aucune conversation</p>
                <p className="text-xs text-gray-300 mt-1">Les conversations apparaitront ici.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv.id)}
                    className={`w-full rounded-xl p-3 text-left transition-colors ${
                      selectedConv === conv.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{conv.clientName}</p>
                      <AppBadge variant={conv.status === 'OPEN' ? 'success' : 'default'}>
                        {conv.status === 'OPEN' ? 'Ouvert' : 'Ferme'}
                      </AppBadge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">{conv.lastMessage}</p>
                  </button>
                ))}
              </div>
            )}
          </AppCard>

          {/* Chat area */}
          <div className="lg:col-span-2">
            <AppCard className="flex flex-col h-full" padding="sm">
              <div className="flex flex-1 items-center justify-center min-h-100">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-400">
                    {conversations.length === 0
                      ? 'Le chat sera disponible quand les clients enverront des messages.'
                      : 'Selectionnez une conversation'}
                  </p>
                </div>
              </div>
            </AppCard>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

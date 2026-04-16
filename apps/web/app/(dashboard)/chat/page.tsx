'use client';

import { useState } from 'react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useConversations } from '@/lib/hooks/useChat';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { NewConversationDialog } from './NewConversationDialog';

export default function ChatPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: conversationsData, isLoading } = useConversations({
    limit: 50,
    search: search || undefined,
  });

  const conversations = conversationsData?.data || [];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
          <p className="text-sm text-gray-500 mt-1">
            Communication en temps reel avec les clients.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" style={{ minHeight: '70vh' }}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedConvId}
            onSelect={setSelectedConvId}
            onNewConversation={() => setDialogOpen(true)}
            isLoading={isLoading}
            search={search}
            onSearchChange={setSearch}
          />

          <div className="lg:col-span-2">
            <ChatPanel
              conversationId={selectedConvId}
              onConversationClosed={() => setSelectedConvId(null)}
            />
          </div>
        </div>
      </div>

      <NewConversationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => setSelectedConvId(id)}
      />
    </PageTransition>
  );
}

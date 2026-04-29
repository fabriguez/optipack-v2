'use client';

import { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { searchers } from '@/lib/api/searchers';
import { useCreateConversation } from '@/lib/hooks/useChat';

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onClose, onCreated }: NewConversationDialogProps) {
  const [clientId, setClientId] = useState('');
  const [agencyId, setAgencyId] = useState('');

  const createMutation = useCreateConversation();

  const handleSubmit = () => {
    if (!clientId || !agencyId) return;
    createMutation.mutate(
      { clientId, agencyId },
      {
        onSuccess: (res) => {
          onCreated(res.data.id);
          setClientId('');
          setAgencyId('');
          onClose();
        },
      },
    );
  };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouvelle conversation">
      <div className="space-y-4">
        <AppSearchSelect
          label="Client"
          placeholder="Selectionner un client"
          value={clientId}
          onChange={(v) => setClientId(v ?? '')}
          search={(q, l) => searchers.clients(q, l)}
          required
        />
        <AppSearchSelect
          label="Agence"
          placeholder="Selectionner une agence"
          value={agencyId}
          onChange={(v) => setAgencyId(v ?? '')}
          search={(q, l) => searchers.agencies(q, l)}
          required
        />
        <div className="flex justify-end gap-3 pt-2">
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            onClick={handleSubmit}
            loading={createMutation.isPending}
            disabled={!clientId || !agencyId}
          >
            Creer
          </AppButton>
        </div>
      </div>
    </AppDialog>
  );
}

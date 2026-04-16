'use client';

import { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useClients } from '@/lib/hooks/useClients';
import { useAgencies } from '@/lib/hooks/useAgencies';
import { useCreateConversation } from '@/lib/hooks/useChat';

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onClose, onCreated }: NewConversationDialogProps) {
  const [clientId, setClientId] = useState('');
  const [agencyId, setAgencyId] = useState('');

  const { data: clientsData } = useClients({ limit: 200 });
  const { data: agenciesData } = useAgencies({ limit: 200 });
  const createMutation = useCreateConversation();

  const clientOptions = (clientsData?.data || []).map((c: any) => ({
    value: c.id,
    label: c.fullName,
  }));

  const agencyOptions = (agenciesData?.data || []).map((a: any) => ({
    value: a.id,
    label: a.name,
  }));

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
        <AppSelect
          label="Client"
          placeholder="Selectionner un client"
          options={clientOptions}
          value={clientId}
          onValueChange={setClientId}
        />
        <AppSelect
          label="Agence"
          placeholder="Selectionner une agence"
          options={agencyOptions}
          value={agencyId}
          onValueChange={setAgencyId}
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

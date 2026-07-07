'use client';

import { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Mail, Plus, X } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Envoie aux adresses choisies. Liste vide = destinataires par defaut cote serveur. */
  onSend: (recipients: string[]) => Promise<void> | void;
  sending?: boolean;
}

/**
 * Choix des destinataires avant envoi du rapport journalier par mail. On peut
 * saisir une liste d'adresses (chips). Le mail part avec le PDF de synthese,
 * les pieces jointes du rapport et l'observation incluse.
 */
export function DailyReportEmailDialog({ open, onClose, onSend, sending }: Props) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addEmail = () => {
    // Autorise le collage d'une liste separee par virgule / espace / point-virgule.
    const parts = draft
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const invalid = parts.find((e) => !EMAIL_RE.test(e));
    if (invalid) {
      setError(`Email invalide : ${invalid}`);
      return;
    }
    setEmails((prev) => Array.from(new Set([...prev, ...parts])));
    setDraft('');
    setError(null);
  };

  const removeEmail = (e: string) => setEmails((prev) => prev.filter((v) => v !== e));

  const reset = () => {
    setEmails([]);
    setDraft('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = async () => {
    await onSend(emails);
    reset();
  };

  return (
    <AppDialog open={open} onClose={handleClose} title="Envoyer le rapport par mail" size="sm">
      <p className="mb-3 text-sm text-gray-600">
        Le mail contient le rapport en PDF, les pieces jointes et l&apos;observation.
        Ajoutez les adresses des destinataires.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <AppInput
            type="email"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder="nom@exemple.com"
          />
        </div>
        <AppButton type="button" variant="outline" onClick={addEmail} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
          Ajouter
        </AppButton>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {emails.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {emails.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700"
            >
              {e}
              <button
                type="button"
                onClick={() => removeEmail(e)}
                className="rounded-full p-0.5 hover:bg-primary-100"
                aria-label={`Retirer ${e}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Laissez vide pour envoyer aux destinataires par defaut (chef d&apos;agence, admins,
        caissier ayant ferme la caisse).
      </p>

      <div className="mt-6 flex justify-end gap-3">
        <AppButton variant="ghost" onClick={handleClose} disabled={sending}>
          Annuler
        </AppButton>
        <AppButton onClick={handleSend} loading={sending}>
          <Mail className="h-4 w-4" />
          Envoyer{emails.length > 0 ? ` (${emails.length})` : ''}
        </AppButton>
      </div>
    </AppDialog>
  );
}

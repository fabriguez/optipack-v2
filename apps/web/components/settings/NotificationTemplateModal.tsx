'use client';

import { useState, useEffect } from 'react';
import { Save, Trash2, Info } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSwitch } from '@/components/ui/AppSwitch';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { notificationConfigApi } from '@/lib/api/config';
import type { NotificationEventDef, NotificationEventAttachment, NotificationTemplate } from '@/lib/api/config';

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  PUSH: 'Push',
};

interface Props {
  open: boolean;
  onClose: () => void;
  eventDef: NotificationEventDef;
  channel: string;
  existingTemplate?: NotificationTemplate | null;
}

export function NotificationTemplateModal({ open, onClose, eventDef, channel, existingTemplate }: Props) {
  const qc = useQueryClient();
  const isEmail = channel === 'EMAIL';

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Record<string, boolean>>({});
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (existingTemplate) {
      setSubject(existingTemplate.subject ?? '');
      setBody(existingTemplate.body);
      setAttachments((existingTemplate.attachments as Record<string, boolean>) ?? {});
      setIsActive(existingTemplate.isActive);
    } else {
      setSubject('');
      setBody('');
      setAttachments({});
      setIsActive(true);
    }
  }, [existingTemplate, open]);

  const save = useMutation({
    mutationFn: () =>
      notificationConfigApi.upsertTemplate(eventDef.kind, channel, {
        subject: isEmail ? (subject || undefined) : undefined,
        body,
        attachments: Object.keys(attachments).length > 0 ? attachments : undefined,
        isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template enregistré');
      onClose();
    },
    onError: () => toast.error("Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () => notificationConfigApi.deleteTemplate(eventDef.kind, channel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template supprimé (retour au défaut système)');
      onClose();
    },
    onError: () => toast.error('Échec de la suppression'),
  });

  const insertVar = (varName: string) => {
    setBody((prev) => prev + `{{${varName}}}`);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Template — ${eventDef.label} / ${CHANNEL_LABELS[channel] ?? channel}`}
      description={eventDef.description}
      size="lg"
    >
      <div className="flex flex-col gap-5">

        {/* Variables disponibles */}
        <div className="rounded-lg border border-primary-100 bg-primary-50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-700">
            <Info className="h-3.5 w-3.5" />
            Variables disponibles — cliquer pour insérer dans le template
          </p>
          <div className="flex flex-wrap gap-1.5">
            {eventDef.variables.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => insertVar(v.name)}
                title={`${v.label} — ex: ${v.example}`}
                className="rounded border border-primary-200 bg-white px-2 py-0.5 text-xs font-mono text-primary-800 hover:bg-primary-100 transition-colors"
              >
                {`{{${v.name}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Sujet (email seulement) */}
        {isEmail && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Sujet de l&apos;email</label>
            <AppInput
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Votre colis {{trackingNumber}} est arrivé !"
            />
          </div>
        )}

        {/* Corps du message */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            {isEmail ? 'Corps HTML de l\'email' : 'Message'}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={isEmail ? 10 : 6}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 resize-y"
            placeholder={
              isEmail
                ? '<p>Bonjour {{clientName}},</p>\n<p>Votre colis <strong>{{trackingNumber}}</strong> est arrivé à destination.</p>'
                : 'Bonjour {{clientName}}, votre colis {{trackingNumber}} est arrivé !'
            }
          />
          {isEmail && (
            <p className="text-xs text-gray-400">{'HTML complet ou fragment. Les variables {{variable}} sont remplacées avant l\'envoi.'}</p>
          )}
        </div>

        {/* Pièces jointes */}
        {eventDef.attachments.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Pièces jointes</label>
            <div className="space-y-2">
              {eventDef.attachments.map((att: NotificationEventAttachment) => (
                <AppSwitch
                  key={att.key}
                  checked={attachments[att.key] ?? false}
                  onCheckedChange={(v) => setAttachments((prev) => ({ ...prev, [att.key]: v }))}
                  label={att.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Activation */}
        <AppSwitch
          checked={isActive}
          onCheckedChange={setIsActive}
          label="Template actif (désactiver pour revenir au défaut système)"
        />

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          {existingTemplate ? (
            <AppButton
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={() => remove.mutate()}
              loading={remove.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </AppButton>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <AppButton variant="outline" onClick={onClose}>Annuler</AppButton>
            <AppButton onClick={() => save.mutate()} loading={save.isPending} disabled={!body.trim()}>
              <Save className="h-4 w-4" />
              Enregistrer
            </AppButton>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}

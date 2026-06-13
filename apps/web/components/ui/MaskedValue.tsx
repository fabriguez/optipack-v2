'use client';

import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Valeur retournee par le backend quand un champ est masque (redact: 'ref'). */
export interface MaskedRef {
  id?: string | null;
  masked: true;
}

export function isMasked(value: unknown): value is MaskedRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MaskedRef).masked === true
  );
}

interface MaskedValueProps {
  /** La valeur a afficher — peut etre un objet normal ou un MaskedRef. */
  value: unknown;
  /** Rendu de secours si la valeur n'est pas masquee. */
  children?: (value: NonNullable<unknown>) => React.ReactNode;
  /** Texte affiché à la place du contenu masqué. */
  label?: string;
  className?: string;
}

/**
 * Affiche "Acces restreint" (avec cadenas) si `value` est un MaskedRef
 * `{ id, masked: true }`. Sinon appelle `children(value)` pour le rendu normal.
 *
 * Usage :
 * ```tsx
 * <MaskedValue value={parcel.client}>
 *   {(client) => <span>{client.fullName}</span>}
 * </MaskedValue>
 * ```
 */
export function MaskedValue({ value, children, label = 'Acces restreint', className }: MaskedValueProps) {
  if (isMasked(value)) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-gray-400', className)}>
        <LockKeyhole className="h-3 w-3 flex-shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  if (value == null) return <span className={cn('text-gray-400', className)}>—</span>;

  return <>{children ? children(value) : null}</>;
}

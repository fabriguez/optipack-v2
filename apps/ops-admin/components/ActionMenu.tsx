'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Style destructif (rouge). */
  destructive?: boolean;
  /** Cache l'entree si false (utile pour cacher freeze/unfreeze selon status). */
  hidden?: boolean;
  /** Disable l'entree (grise mais visible). */
  disabled?: boolean;
  /** Ligne separatrice avant cette entree. */
  separatorBefore?: boolean;
}

interface Props {
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  /** Label aria pour le bouton trigger. */
  ariaLabel?: string;
}

/**
 * Menu actions compact declenche par un bouton "3 points". Click-outside et
 * Escape ferment le menu. Aucune dependance externe (pas de Radix) -- on
 * reste leger pour ops-admin.
 */
export function ActionMenu({ items, align = 'right', ariaLabel = 'Actions' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = items.filter((it) => !it.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={
            'absolute z-30 mt-1 min-w-[200px] rounded-md border bg-white py-1 shadow-lg ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
        >
          {visible.map((it, idx) => (
            <div key={`${it.label}-${idx}`}>
              {it.separatorBefore && idx > 0 && <div className="my-1 border-t" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ' +
                  (it.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50')
                }
              >
                {it.icon && <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{it.icon}</span>}
                <span>{it.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { SupportChat } from './SupportChat';

/**
 * Bulle flottante support (FAB) : bouton bas-droite present sur l'espace client.
 * Ouvre un panneau overlay avec le chat Stream. Le chat n'est monte (et donc
 * connecte) qu'a la premiere ouverture.
 */
export function SupportFab() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) setMounted(true);
      return next;
    });
  }

  return (
    <>
      {/* Panneau chat */}
      <div
        className={`fixed bottom-24 right-4 z-50 flex h-[70vh] max-h-[600px] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl transition-all duration-200 sm:right-6 ${
          open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        style={{ borderColor: 'var(--skin-border)' }}
        aria-hidden={!open}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--skin-border)' }}
        >
          <p className="text-sm font-semibold text-gray-900">Support client</p>
          <button onClick={() => setOpen(false)} aria-label="Fermer" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">{mounted && <SupportChat />}</div>
      </div>

      {/* Bouton flottant */}
      <button
        onClick={toggle}
        aria-label={open ? 'Fermer le support' : 'Contacter le support'}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-6"
        style={{ background: 'var(--skin-primary)' }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}

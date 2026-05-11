'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Check } from 'lucide-react';
import { useState } from 'react';
import { useSkin } from '@/lib/providers/SkinProvider';

/**
 * Floating skin picker visible on the landing page so visitors can try the 5
 * skins in real time. Tenant admins still configure the persistent skin from
 * the Studio (/studio).
 */
export function SkinPicker() {
  const { skinId, setSkin, available } = useSkin();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="mb-3 w-72 p-4 skin-card"
          >
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--skin-primary)' }}
              >
                Essayez un theme
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {available.map((s) => {
                const active = skinId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSkin(s.id)}
                    className="group relative flex items-center gap-2 p-2 text-left skin-radius transition-colors"
                    style={{
                      background: active
                        ? 'color-mix(in oklab, var(--skin-primary) 10%, transparent)'
                        : 'transparent',
                      border: `1px solid ${active ? 'var(--skin-primary)' : 'var(--skin-border)'}`,
                    }}
                  >
                    <span
                      className="h-7 w-7 shrink-0 rounded-full"
                      style={{
                        background: `linear-gradient(135deg, ${s.heroGradient[0]}, ${s.heroGradient[2]})`,
                      }}
                    />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: 'var(--skin-foreground)' }}
                    >
                      {s.name}
                    </span>
                    {active && (
                      <Check
                        className="absolute right-1.5 top-1.5 h-3 w-3"
                        style={{ color: 'var(--skin-primary)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px]" style={{ color: 'var(--skin-muted)' }}>
              Demo seulement - votre admin choisit le theme final dans le
              Studio.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-12 items-center justify-center text-white skin-radius-lg skin-shadow"
        style={{ background: 'var(--skin-primary)' }}
        aria-label="Choisir un theme"
      >
        <Palette className="h-5 w-5" />
      </motion.button>
    </div>
  );
}

'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

interface Tab {
  value: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface AppTabsProps {
  tabs: Tab[];
  defaultValue?: string;
  className?: string;
}

/**
 * Tabs responsives :
 *  - Toujours sur une SEULE ligne, scroll horizontal si depassement.
 *  - L'ancienne grille 2-colonnes sur mobile etait illisible quand on a 5+
 *    onglets (la barre prenait 3-4 lignes). Maintenant on glisse meme sur
 *    mobile, avec un masque degrade sur les bords pour indiquer le scroll.
 *
 * Conserve l'apparence "pilule" sur l'onglet actif (bg-white + shadow-sm).
 */
export function AppTabs({ tabs, defaultValue, className }: AppTabsProps) {
  return (
    <Tabs defaultValue={defaultValue || tabs[0]?.value} className={className}>
      <div className="relative">
        {/* Indicateurs de scroll : gradient discret aux bords pour signaler
            qu'on peut faire glisser horizontalement. Cache si l'overflow
            n'est pas reel (browsers modernes le rendent transparent
            naturellement). */}
        <div className="rounded-xl bg-gray-100 p-1 overflow-hidden">
          <TabsList
            className={cn(
              'flex flex-nowrap gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap',
                  'text-gray-500 hover:text-gray-700',
                  'data-active:bg-white data-active:text-gray-900 data-active:shadow-sm',
                )}
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {/* Hint visuel scroll : 16px de degrade a droite. Pointer-events
            none pour ne pas bloquer le clic sur les tabs sous le hint. */}
        <div
          className="pointer-events-none absolute top-1 bottom-1 right-1 w-6 rounded-r-xl bg-linear-to-l from-gray-100 to-transparent"
          aria-hidden
        />
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

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
 *  - Mobile (< sm) : une seule ligne scrollable horizontalement (scrollbar
 *    masquee, scroll-snap) -- un pave de 4-5 lignes d'onglets empilees n'est
 *    pas lisible sur petit ecran.
 *  - >= sm : les onglets passent a la ligne (flex-wrap) quand la largeur ne
 *    suffit pas.
 *  - h-auto! : la TabsList de base force h-8 (une ligne) ; sans override les
 *    lignes wrappees debordent/se chevauchent.
 *  - flex-none sur les triggers : le flex-1 de base ecrase les onglets pour
 *    les faire tenir sur la ligne, illisible avec beaucoup d'onglets.
 *
 * Conserve l'apparence "pilule" sur l'onglet actif (bg-white + shadow-sm).
 */
export function AppTabs({ tabs, defaultValue, className }: AppTabsProps) {
  return (
    <Tabs defaultValue={defaultValue || tabs[0]?.value} className={className}>
      <div className="rounded-xl bg-gray-100 p-1">
        <TabsList
          className={cn(
            'flex w-full h-auto! items-center justify-start gap-1',
            'snap-x overflow-x-auto scrollbar-none',
            'sm:flex-wrap sm:overflow-x-visible sm:snap-none',
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'flex flex-none snap-start items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap',
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
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

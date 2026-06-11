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
 *  - Les onglets passent a la ligne (flex-wrap) quand la largeur ne suffit
 *    pas : la barre devient un bloc multi-lignes plutot qu'un scroll
 *    horizontal. Plus lisible sur mobile / quand 5+ onglets.
 *
 * Conserve l'apparence "pilule" sur l'onglet actif (bg-white + shadow-sm).
 */
export function AppTabs({ tabs, defaultValue, className }: AppTabsProps) {
  return (
    <Tabs defaultValue={defaultValue || tabs[0]?.value} className={className}>
      <div className="rounded-xl bg-gray-100 p-1">
        <TabsList className={cn('flex flex-wrap gap-1')}>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap',
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

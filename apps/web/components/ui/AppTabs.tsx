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

export function AppTabs({ tabs, defaultValue, className }: AppTabsProps) {
  return (
    <Tabs defaultValue={defaultValue || tabs[0]?.value} className={className}>
      <TabsList className={cn('flex gap-1 rounded-xl bg-gray-100 p-1')}>
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              'text-gray-500 hover:text-gray-700',
              'data-active:bg-white data-active:text-gray-900 data-active:shadow-sm',
            )}
          >
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

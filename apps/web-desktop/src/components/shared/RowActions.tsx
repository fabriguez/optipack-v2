'use client';

import { MoreHorizontal } from 'lucide-react';
import { AppDropdownMenu } from '@/components/ui/AppDropdownMenu';
import type { ReactNode } from 'react';

interface Action {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface RowActionsProps {
  actions: Action[];
}

export function RowActions({ actions }: RowActionsProps) {
  return (
    <AppDropdownMenu
      trigger={
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      }
      items={actions}
    />
  );
}

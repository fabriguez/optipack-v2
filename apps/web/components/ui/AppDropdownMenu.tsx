'use client';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';
import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface AppDropdownMenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
}

export function AppDropdownMenu({ trigger, items, align = 'end' }: AppDropdownMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<span />}>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={5}
        className="min-w-45 rounded-xl border border-gray-200 p-1 shadow-elevated"
      >
        {items.map((item, i) => (
          <DropdownMenuItem
            key={i}
            onClick={item.onClick}
            disabled={item.disabled}
            variant={item.variant === 'destructive' ? 'destructive' : 'default'}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
            )}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
import type { ReactNode } from 'react';

interface AppTooltipProps {
  children: ReactNode;
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function AppTooltip({ children, content, side = 'top' }: AppTooltipProps) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={<span />}>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={5}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-md"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

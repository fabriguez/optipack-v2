'use client';

import { type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './dialog';
import { cn } from '@/lib/utils/cn';

interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function AppDialog({ open, onClose, title, description, children, size = 'md' }: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'rounded-2xl p-0 gap-0',
          sizeStyles[size],
        )}
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-gray-500 mt-0.5">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  /**
   * Footer fixe en bas du dialog. Reste visible meme quand le body scrolle.
   * Pour soumettre un formulaire depuis le footer : donner un `id` au <form>
   * dans `children` et utiliser `<button type="submit" form={id}>` dans le footer.
   */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function AppDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          'p-0 gap-0 flex flex-col',
          'w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] rounded-xl',
          'sm:w-auto sm:rounded-2xl sm:max-h-[85vh]',
          sizeStyles[size],
        )}
        showCloseButton={false}
      >
        {/* Header (fixe) */}
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
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

        {/* Body (scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          {children}
        </div>

        {/* Footer (fixe) — optionnel */}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 border-t border-gray-100 bg-white px-4 py-3 sm:px-6 rounded-b-xl sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

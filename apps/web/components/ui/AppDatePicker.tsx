'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './input';
import { Label } from './label';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface AppDatePickerProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const AppDatePicker = forwardRef<HTMLInputElement, AppDatePickerProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            type="date"
            className={cn(
              'h-11 rounded-xl pr-10',
              error && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
              className,
            )}
            {...props}
          />
          <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

AppDatePicker.displayName = 'AppDatePicker';

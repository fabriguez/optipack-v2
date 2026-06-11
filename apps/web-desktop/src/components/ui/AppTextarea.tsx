import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { Textarea } from './textarea';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

interface AppTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** className applique sur le wrapper (utile pour grid col-span). */
  wrapperClassName?: string;
}

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  ({ className, wrapperClassName, label, error, id, rows = 3, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn('space-y-1.5', wrapperClassName)}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <Textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={cn(
            'rounded-xl px-4 py-3 resize-y',
            error && 'border-destructive ring-3 ring-destructive/20',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

AppTextarea.displayName = 'AppTextarea';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

interface AppInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <Input
          ref={ref}
          id={inputId}
          className={cn(
            'h-11 rounded-xl',
            error && 'border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/20',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  },
);

AppInput.displayName = 'AppInput';

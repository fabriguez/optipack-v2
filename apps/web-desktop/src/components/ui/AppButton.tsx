import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils/cn';

type AppButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
type AppButtonSize = 'sm' | 'md' | 'lg';

// Map nos variantes vers celles de shadcn
const variantMap: Record<AppButtonVariant, 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline'> = {
  primary: 'default',
  secondary: 'secondary',
  destructive: 'destructive',
  ghost: 'ghost',
  outline: 'outline',
};

const sizeMap: Record<AppButtonSize, 'sm' | 'default' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
}

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variantMap[variant]}
        size={sizeMap[size]}
        disabled={disabled || loading}
        className={cn('rounded-xl gap-2', className)}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Button>
    );
  },
);

AppButton.displayName = 'AppButton';

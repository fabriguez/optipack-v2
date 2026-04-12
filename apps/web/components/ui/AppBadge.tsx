import { Badge } from './badge';
import { cn } from '@/lib/utils/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';

interface AppBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

// Our app-level variant styles (success/warning/error/info map to custom colors)
const appVariantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700 border-transparent',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  outline: 'border-gray-300 text-gray-600 bg-white',
};

// Map our variants to the closest shadcn variant for base styling
const shadcnVariantMap: Record<BadgeVariant, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  default: 'secondary',
  success: 'secondary',
  warning: 'secondary',
  error: 'destructive',
  info: 'secondary',
  outline: 'outline',
};

export function AppBadge({ children, variant = 'default', className }: AppBadgeProps) {
  return (
    <Badge
      variant={shadcnVariantMap[variant]}
      className={cn(
        'rounded-lg px-2.5 py-0.5 text-xs font-medium',
        appVariantStyles[variant],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

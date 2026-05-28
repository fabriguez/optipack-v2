import type { ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';
import { cn } from '@/lib/utils/cn';

interface AppCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  sm: '[&>*[data-slot=card-content]]:px-3 sm:[&>*[data-slot=card-content]]:px-4 py-3 sm:py-4',
  md: '[&>*[data-slot=card-content]]:px-4 sm:[&>*[data-slot=card-content]]:px-6 py-4 sm:py-6',
  lg: '[&>*[data-slot=card-content]]:px-4 sm:[&>*[data-slot=card-content]]:px-6 lg:[&>*[data-slot=card-content]]:px-8 py-5 sm:py-6 lg:py-8',
};

export function AppCard({ children, className, padding = 'md' }: AppCardProps) {
  return (
    <Card
      className={cn(
        'rounded-xl sm:rounded-2xl shadow-card border-gray-100 gap-0',
        paddingStyles[padding],
        className,
      )}
    >
      <CardContent className="p-0">
        {children}
      </CardContent>
    </Card>
  );
}

interface AppCardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AppCardHeader({ title, description, action }: AppCardHeaderProps) {
  return (
    <CardHeader className="flex flex-row items-center justify-between mb-4 p-0">
      <div>
        <CardTitle className="text-lg font-semibold text-gray-900">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-sm text-gray-500 mt-0.5">
            {description}
          </CardDescription>
        )}
      </div>
      {action}
    </CardHeader>
  );
}

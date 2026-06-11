import { cn } from '@/lib/utils/cn';

interface AppSkeletonProps {
  className?: string;
}

export function AppSkeleton({ className }: AppSkeletonProps) {
  return (
    <div className={cn('rounded-xl bg-gray-200 animate-skeleton-pulse', className)} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-white shadow-card border border-gray-100 p-6">
      <AppSkeleton className="h-4 w-1/3 mb-4" />
      <AppSkeleton className="h-8 w-1/2 mb-2" />
      <AppSkeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl bg-white shadow-card border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <AppSkeleton className="h-6 w-40" />
        <AppSkeleton className="h-10 w-32" />
      </div>
      <div className="space-y-3">
        <AppSkeleton className="h-10 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <AppSkeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={3} />
      </div>
    </div>
  );
}

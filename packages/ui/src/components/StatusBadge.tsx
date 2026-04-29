import { cn } from '../utils/cn';

const map: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PROVISIONING: 'bg-blue-100 text-blue-700',
  FROZEN: 'bg-amber-100 text-amber-700',
  MIGRATING: 'bg-purple-100 text-purple-700',
  ARCHIVED: 'bg-gray-100 text-gray-600',
  MAINTENANCE: 'bg-amber-100 text-amber-700',
  DECOMMISSIONED: 'bg-gray-100 text-gray-600',
  succeeded: 'bg-green-100 text-green-700',
  running: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-blue-50 text-blue-600',
  failed: 'bg-red-100 text-red-700',
  rolled_back: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  queued: 'bg-blue-50 text-blue-600',
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-0.5 text-xs font-medium',
        map[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {status}
    </span>
  );
}

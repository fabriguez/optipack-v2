'use client';

import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from 'lucide-react';
import { AppSkeleton } from './AppSkeleton';
import { cn } from '@/lib/utils/cn';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface AppDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
}

export function AppDataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  page = 1,
  totalPages = 1,
  total,
  limit = 20,
  onPageChange,
  onRowClick,
  emptyMessage = 'Aucune donnee trouvee',
  emptyIcon,
}: AppDataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-1">
        <div className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
          {columns.map((col) => (
            <AppSkeleton key={col.key} className="h-4 w-20" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <AppSkeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const effectiveTotal = total ?? data.length;
  const startItem = effectiveTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, effectiveTotal);

  return (
    <div>
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full min-w-160">
          <thead>
            <tr className="border-b-2 border-gray-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400',
                    col.className,
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    {emptyIcon || <Inbox className="h-10 w-10 text-gray-300" />}
                    <p className="text-sm font-medium text-gray-400">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'border-b border-gray-50 transition-all duration-150',
                    onRowClick && 'cursor-pointer hover:bg-primary-50/40',
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-5 py-3.5 text-sm text-gray-700', col.className)}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5">
        <p className="text-xs text-gray-500">
          {effectiveTotal > 0
            ? `${startItem}-${endItem} sur ${effectiveTotal}`
            : 'Aucun resultat'}
        </p>
        <div className="flex items-center gap-1">
          <PaginationButton
            onClick={() => onPageChange?.(1)}
            disabled={page <= 1}
            title="Premiere page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PaginationButton>
          <PaginationButton
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
            title="Page precedente"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PaginationButton>

          {/* Page numbers */}
          {getPageNumbers(page, totalPages).map((p, idx) =>
            p === '...' ? (
              <span key={`dots-${idx}`} className="px-1 text-xs text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange?.(p as number)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                  p === page
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                {p}
              </button>
            ),
          )}

          <PaginationButton
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
            title="Page suivante"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PaginationButton>
          <PaginationButton
            onClick={() => onPageChange?.(totalPages)}
            disabled={page >= totalPages}
            title="Derniere page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </PaginationButton>
        </div>
      </div>
    </div>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  if (current <= 3) return [1, 2, 3, 4, '...', total];
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

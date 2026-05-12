'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
}

/**
 * Pagination client-side reutilisable. Affichage compact :
 *   < 1 .. 4 5 6 .. 12 >    [10/page v]
 *
 * Les pages affichees s'adaptent : on montre toujours la 1ere, la derniere
 * et 2 voisines de la page courante, le reste est ellipse.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  const pagesToShow = (() => {
    const set = new Set<number>([1, totalPages, safePage, safePage - 1, safePage + 1]);
    return Array.from(set).filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-gray-50 px-4 py-2 text-xs text-gray-600">
      <span>
        {total === 0 ? '0' : `${start} - ${end}`} sur {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Page precedente"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pagesToShow.map((p, i) => {
          const prev = pagesToShow[i - 1];
          const gap = prev !== undefined && p - prev > 1;
          return (
            <span key={p} className="flex items-center">
              {gap && <span className="px-1 text-gray-400">...</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                className={
                  'inline-flex h-7 min-w-[28px] items-center justify-center rounded border px-1.5 ' +
                  (p === safePage
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'bg-white hover:bg-gray-50')
                }
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Page suivante"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="ml-2 rounded border bg-white px-1 py-0.5"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}/page
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** Helper : slice un tableau pour la page courante. */
export function paginate<T>(arr: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return arr.slice(start, start + pageSize);
}

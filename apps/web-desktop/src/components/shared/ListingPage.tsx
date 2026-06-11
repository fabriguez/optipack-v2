'use client';

import type { ReactNode } from 'react';
import { PageTransition } from './PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { SearchBar } from './SearchBar';
import { ExportButton } from './ExportButton';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface ListingPageProps<T> {
  title: string;
  subtitle?: string;
  data: T[];
  columns: Column<T>[];
  exportColumns: { key: string; label: string }[];
  exportFileName: string;
  isLoading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Boutons en haut a droite : Creer, Importer */
  headerActions?: ReactNode;
  /** Slot pour FilterDialog (entre export et effacer) */
  filtersSlot?: ReactNode;
  /** Contenu sous le tableau */
  extraContent?: ReactNode;
}

/**
 * Layout standardise pour TOUTES les pages listing :
 *
 * +--[ Titre ]---------------------------[ Creer ][ Importer ]+
 * |                                                            |
 * | [ Rechercher... ] -------- [ Exporter ][ Filtres ] [ x ]  |
 * |                                                            |
 * | +--Card--------------------------------------------------+ |
 * | | Table + Pagination                                     | |
 * | +--------------------------------------------------------+ |
 */
export function ListingPage<T extends Record<string, any>>({
  title,
  subtitle,
  data,
  columns,
  exportColumns,
  exportFileName,
  isLoading,
  page = 1,
  totalPages = 1,
  total,
  limit = 20,
  onPageChange,
  onRowClick,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Rechercher...',
  headerActions,
  filtersSlot,
  extraContent,
}: ListingPageProps<T>) {
  return (
    <PageTransition>
      <div className="space-y-5">
        {/* Ligne 1 : Titre + actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            {total !== undefined && !subtitle && (
              <p className="text-sm text-gray-500 mt-1">{total} resultats</p>
            )}
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>

        {/* Ligne 2 : Recherche --- Exporter | Filtres | Effacer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            {onSearchChange && (
              <SearchBar value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <ExportButton data={data} columns={exportColumns} fileName={exportFileName} />
            {filtersSlot}
          </div>
        </div>

        {/* Ligne 3 : Card avec table + pagination */}
        <AppCard padding="sm">
          <AppDataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={onPageChange}
            onRowClick={onRowClick}
          />
        </AppCard>

        {extraContent}
      </div>
    </PageTransition>
  );
}

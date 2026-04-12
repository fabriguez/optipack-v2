'use client';

import { cn } from '@/lib/utils/cn';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterChipsProps {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
            value === option.value
              ? 'bg-primary-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-700',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={cn(
              'ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
              value === option.value ? 'bg-white/20' : 'bg-gray-100',
            )}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

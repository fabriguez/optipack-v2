import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../utils/cn';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500',
          className,
        )}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500',
        className,
      )}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        {...props}
        className={cn(
          'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500',
          className,
        )}
      />
    );
  },
);

export function SubmitButton({
  loading,
  children,
  className,
  disabled,
  ...props
}: {
  loading?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className={cn(
        'rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50',
        className,
      )}
    >
      {loading ? '...' : children}
    </button>
  );
}

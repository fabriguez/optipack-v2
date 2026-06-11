'use client';

import { Avatar, AvatarImage, AvatarFallback } from './avatar';
import { cn } from '@/lib/utils/cn';

interface AppAvatarProps {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeStyles = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export function AppAvatar({ src, alt, fallback, size = 'md', className }: AppAvatarProps) {
  const initials = fallback
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <Avatar
      className={cn(
        'bg-primary-100',
        sizeStyles[size],
        className,
      )}
    >
      <AvatarImage src={src || undefined} alt={alt} />
      <AvatarFallback className="font-semibold text-primary-700 bg-primary-100">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

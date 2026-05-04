'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { resolveImageUrl } from '@/lib/api/imageUrl';

interface AgencyLike {
  id?: string;
  name?: string;
  imageUrl?: string | null;
}

interface AgencyAvatarProps {
  agency?: AgencyLike | null;
  size?: number; // px
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const ROUND_CLASSES: Record<NonNullable<AgencyAvatarProps['rounded']>, string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

/**
 * Affiche la photo de l'agence avec fallback Building2.
 * Utilise <img onError> pour basculer sur l'icone si l'image ne charge pas.
 */
export function AgencyAvatar({
  agency,
  size = 32,
  className,
  rounded = 'md',
}: AgencyAvatarProps) {
  const [errored, setErrored] = useState(false);
  const url = resolveImageUrl(agency?.imageUrl);
  const showImage = !!url && !errored;
  const roundClass = ROUND_CLASSES[rounded];
  const iconSize = Math.max(12, Math.round(size * 0.55));

  const baseClass = `inline-flex shrink-0 items-center justify-center overflow-hidden border border-gray-100 ${roundClass}`;
  const style = { width: size, height: size } as const;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url!}
        alt={agency?.name || 'Agence'}
        className={`${baseClass} object-cover bg-gray-50 ${className ?? ''}`}
        style={style}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <span
      className={`${baseClass} bg-primary-50 ${className ?? ''}`}
      style={style}
      aria-label={agency?.name || 'Agence'}
    >
      <Building2 style={{ width: iconSize, height: iconSize }} className="text-primary-600" />
    </span>
  );
}

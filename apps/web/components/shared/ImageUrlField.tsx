'use client';

import { useState } from 'react';
import { ImageInput } from './ImageInput';
import { uploadImage, type UploadResult } from '@/lib/api/uploads';
import { toast } from 'sonner';

interface ImageUrlFieldProps {
  /** URL actuelle (depuis le formulaire / entite) */
  value?: string | null;
  /** Appele avec la nouvelle URL apres upload reussi (ou null pour effacer) */
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  height?: number;
  /** Caméra par défaut : "environment" pour colis/agence, "user" pour selfie. */
  cameraFacing?: 'user' | 'environment';
  className?: string;
  allowClear?: boolean;
  /**
   * Fonction d'upload a utiliser. Defaut : uploadImage (objet prive servi par
   * /uploads/object). Passer uploadPublicImage pour un asset public (logo) qui
   * doit s'afficher sans token (login, favicon, site web).
   */
  uploadFn?: (file: File) => Promise<UploadResult>;
}

/**
 * Champ de formulaire qui remplace les inputs URL d'image classiques.
 *
 * Utilise ImageInput (drop + camera) et uploade le fichier vers /uploads/image.
 * L'URL retournee est passee a `onChange` -> le formulaire la stocke en
 * proofUrl/receiptUrl/etc.
 */
export function ImageUrlField({
  value,
  onChange,
  label,
  hint,
  height,
  cameraFacing,
  className,
  allowClear = true,
  uploadFn = uploadImage,
}: ImageUrlFieldProps) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadFn(file);
      onChange(res.url);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Echec de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleClear = async () => {
    onChange(null);
  };

  return (
    <ImageInput
      label={label}
      hint={hint}
      value={value ?? null}
      onFile={handleFile}
      onClear={allowClear ? handleClear : undefined}
      uploading={uploading}
      height={height}
      cameraFacing={cameraFacing}
      className={className}
    />
  );
}

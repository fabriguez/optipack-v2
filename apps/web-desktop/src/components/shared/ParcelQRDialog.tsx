'use client';

import { useState } from 'react';
import { Download, Printer, ExternalLink } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AuthedImage, openAuthedFile } from '@/components/shared/AuthedImage';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  parcel: { id: string; trackingNumber: string; designation?: string } | null;
}

/**
 * Dialog d'apercu / telechargement / impression du QR code d'un colis.
 * Permet aussi de telecharger l'etiquette PDF complete.
 */
export function ParcelQRDialog({ open, onClose, parcel }: Props) {
  const [downloading, setDownloading] = useState<'qr' | 'label' | null>(null);

  if (!parcel) return null;
  const qrPath = `/api/v1/parcels/${parcel.id}/qrcode`;
  const labelPath = `/api/v1/parcels/${parcel.id}/label`;

  const downloadQr = async () => {
    setDownloading('qr');
    try {
      const res = await apiClient.get(`/parcels/${parcel.id}/qrcode`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${parcel.trackingNumber}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec telechargement');
    } finally {
      setDownloading(null);
    }
  };

  const downloadLabel = async () => {
    setDownloading('label');
    try {
      await openAuthedFile(labelPath, `etiquette-${parcel.trackingNumber}.pdf`, true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec telechargement');
    } finally {
      setDownloading(null);
    }
  };

  const printLabel = async () => {
    try {
      // Recupere le PDF en blob et l'ouvre dans un nouvel onglet pour impression.
      await openAuthedFile(labelPath, `etiquette-${parcel.trackingNumber}.pdf`, false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Echec ouverture');
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`QR / Etiquette - ${parcel.trackingNumber}`}
      size="md"
      footer={
        <AppButton variant="ghost" onClick={onClose}>
          Fermer
        </AppButton>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white p-6">
          <AuthedImage
            src={qrPath}
            alt={`QR code ${parcel.trackingNumber}`}
            className="h-48 w-48 object-contain"
            fallback={<div className="h-48 w-48 rounded-lg bg-gray-100" />}
          />
          <p className="font-mono text-sm font-bold text-primary-700">{parcel.trackingNumber}</p>
          {parcel.designation && (
            <p className="text-xs text-gray-500 text-center">{parcel.designation}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <AppButton variant="outline" onClick={downloadQr} loading={downloading === 'qr'}>
            <Download className="h-3.5 w-3.5" />
            Telecharger QR (PNG)
          </AppButton>
          <AppButton variant="outline" onClick={downloadLabel} loading={downloading === 'label'}>
            <Download className="h-3.5 w-3.5" />
            Etiquette (PDF)
          </AppButton>
          <AppButton onClick={printLabel} className='col-span-2'>
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </AppButton>
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          <ExternalLink className="inline h-3 w-3 mr-1" />
          Le QR encode le numero de tracking. Notre scanner sait le relire en mode QR ou code-barres.
        </p>
      </div>
    </AppDialog>
  );
}

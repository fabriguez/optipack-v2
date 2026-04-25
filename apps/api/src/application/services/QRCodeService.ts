import QRCode from 'qrcode';

function getTrackingBaseUrl(): string {
  // Priorise une URL publique configurable, fallback sur le domaine de prod
  const fromEnv =
    process.env.PUBLIC_TRACKING_URL ||
    process.env.TRACKING_URL ||
    process.env.PUBLIC_WEB_URL ||
    process.env.WEB_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  return 'https://transitsoftservices.app';
}

export class QRCodeService {
  /**
   * QR code PNG buffer pour une chaine arbitraire.
   */
  static async generateQRCode(data: string): Promise<Buffer> {
    return QRCode.toBuffer(data, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * QR code pour un colis : encode directement l'URL de tracking publique.
   * Les scanners ouvrent ainsi la page web sans avoir a parser un JSON.
   */
  static async generateParcelQR(
    trackingNumber: string,
    _parcelId: string,
  ): Promise<Buffer> {
    const url = `${getTrackingBaseUrl()}/tracking/${trackingNumber}`;
    return this.generateQRCode(url);
  }

  static buildTrackingUrl(trackingNumber: string): string {
    return `${getTrackingBaseUrl()}/tracking/${trackingNumber}`;
  }
}

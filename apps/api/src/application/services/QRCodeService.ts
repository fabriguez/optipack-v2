import QRCode from 'qrcode';

export class QRCodeService {
  /**
   * Generates a QR code as a PNG buffer from arbitrary string data.
   */
  static async generateQRCode(data: string): Promise<Buffer> {
    const buffer = await QRCode.toBuffer(data, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return buffer;
  }

  /**
   * Generates a QR code for a parcel containing JSON payload
   * with tracking number, parcel ID, and a tracking URL.
   */
  static async generateParcelQR(
    trackingNumber: string,
    parcelId: string,
  ): Promise<Buffer> {
    const payload = JSON.stringify({
      tracking: trackingNumber,
      id: parcelId,
      url: `https://transitsoftservices.app/tracking/${trackingNumber}`,
    });
    return this.generateQRCode(payload);
  }
}

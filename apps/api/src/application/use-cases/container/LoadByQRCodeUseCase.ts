import { inject, injectable } from 'tsyringe';
import { LoadParcelsUseCase } from './LoadParcelsUseCase';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Charger un colis dans un conteneur a partir de son QR code (= trackingNumber).
 * Le QR code encode l'URL `https://.../tracking/{trackingNumber}` ; le client
 * frontend extrait le tracking et l'envoie. On accepte aussi un tracking brut.
 *
 * On reutilise LoadParcelsUseCase pour appliquer toutes les regles
 * (capacite, type, dangerosite, destination != depart, etc.).
 */
@injectable()
export class LoadByQRCodeUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private loadParcels: LoadParcelsUseCase,
  ) {}

  async execute(containerId: string, trackingNumber: string, userId: string) {
    const tracking = this.extractTracking(trackingNumber);
    const parcel = await this.parcelRepo.findByTracking(tracking);
    if (!parcel) throw new NotFoundError('Colis', tracking);

    const result = await this.loadParcels.execute(containerId, [parcel.id], userId);

    if (result.errors.length > 0) {
      const reason = result.errors[0]?.reason ?? 'Echec du chargement';
      return {
        success: false,
        parcelId: parcel.id,
        trackingNumber: parcel.trackingNumber,
        reason,
      };
    }

    return {
      success: true,
      parcelId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      designation: parcel.designation,
    };
  }

  private extractTracking(input: string): string {
    const trimmed = input.trim();
    // Si le QR encode une URL, extraire le dernier segment
    if (trimmed.includes('/tracking/')) {
      const m = trimmed.match(/\/tracking\/([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return trimmed;
  }
}

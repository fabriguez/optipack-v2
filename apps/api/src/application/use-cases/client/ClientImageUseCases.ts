import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { extFromMime } from '../../../presentation/middleware/upload';

type Slot = 'profile' | 'idDocument' | 'idDocumentBack';

const URL_FIELD: Record<Slot, 'imageUrl' | 'idDocumentUrl' | 'idDocumentBackUrl'> = {
  profile: 'imageUrl',
  idDocument: 'idDocumentUrl',
  idDocumentBack: 'idDocumentBackUrl',
};
const KEY_FIELD: Record<Slot, 'imageKey' | 'idDocumentKey' | 'idDocumentBackKey'> = {
  profile: 'imageKey',
  idDocument: 'idDocumentKey',
  idDocumentBack: 'idDocumentBackKey',
};

function absoluteApiUrl(path: string): string {
  const base = config.apiUrl?.replace(/\/$/, '') || '';
  if (/^https?:\/\//i.test(base)) return `${base}${path}`;
  return path;
}

@injectable()
export class UploadClientImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(clientId: string, slot: Slot, file: Express.Multer.File) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        imageKey: true,
        idDocumentKey: true,
        idDocumentBackKey: true,
      },
    });
    if (!client) throw new NotFoundError('Client', clientId);
    if (!file) throw new BusinessError('Aucun fichier fourni');

    const ext = extFromMime(file.mimetype);
    const key = this.storage.buildKey(`clients/${clientId}/${slot}`, ext);
    await this.storage.uploadBuffer(key, file.buffer, file.mimetype);

    const imageUrl = absoluteApiUrl(`/api/v1/clients/${clientId}/image/${slot}?v=${Date.now()}`);

    const oldKey = (client as any)[KEY_FIELD[slot]] as string | null;
    if (oldKey) this.storage.deleteObject(oldKey).catch(() => {});

    return prisma.client.update({
      where: { id: clientId },
      data: {
        [URL_FIELD[slot]]: imageUrl,
        [KEY_FIELD[slot]]: key,
      } as any,
    });
  }
}

@injectable()
export class DeleteClientImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(clientId: string, slot: Slot) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        imageKey: true,
        idDocumentKey: true,
        idDocumentBackKey: true,
      },
    });
    if (!client) throw new NotFoundError('Client', clientId);

    const key = (client as any)[KEY_FIELD[slot]] as string | null;
    if (key) await this.storage.deleteObject(key).catch(() => {});

    return prisma.client.update({
      where: { id: clientId },
      data: {
        [URL_FIELD[slot]]: null,
        [KEY_FIELD[slot]]: null,
      } as any,
    });
  }
}

@injectable()
export class GetClientImageUseCase {
  constructor(private storage: StorageService) {}

  async execute(clientId: string, slot: Slot) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        imageKey: true,
        idDocumentKey: true,
        idDocumentBackKey: true,
      },
    });
    if (!client) return null;
    const key = (client as any)[KEY_FIELD[slot]] as string | null;
    if (!key) return null;
    return this.storage.getObject(key);
  }
}

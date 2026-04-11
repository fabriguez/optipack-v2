import { inject, injectable } from 'tsyringe';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetClientUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
  ) {}

  async execute(id: string) {
    const client = await this.clientRepo.findById(id);
    if (!client) {
      throw new NotFoundError('Client', id);
    }
    return client;
  }
}

import { inject, injectable } from 'tsyringe';
import { calculateLoyaltyPoints, getLoyaltyTier } from '@optipack/shared';
import { LOYALTY_REPOSITORY, type ILoyaltyRepository } from '../../interfaces/ILoyaltyRepository';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class AddLoyaltyPointsUseCase {
  constructor(
    @inject(LOYALTY_REPOSITORY) private loyaltyRepo: ILoyaltyRepository,
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
  ) {}

  async execute(clientId: string, amount: number, source: string) {
    const client = await this.clientRepo.findById(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

    const points = calculateLoyaltyPoints(amount);
    if (points <= 0) return { points: 0, newTotal: client.loyaltyPoints, tier: client.loyaltyTier };

    // Create transaction
    await this.loyaltyRepo.create({
      points,
      type: 'EARNED',
      source,
      description: `${points} points pour paiement de ${amount}`,
      client: { connect: { id: clientId } },
    });

    // Update client
    const newTotal = client.loyaltyPoints + points;
    const newTier = getLoyaltyTier(newTotal);

    await this.clientRepo.update(clientId, {
      loyaltyPoints: newTotal,
      loyaltyTier: newTier,
      totalSpent: { increment: amount },
    });

    return { points, newTotal, tier: newTier };
  }
}

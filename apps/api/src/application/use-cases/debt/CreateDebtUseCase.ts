import { inject, injectable } from 'tsyringe';
import { DEBT_REPOSITORY, type IDebtRepository } from '../../interfaces/IDebtRepository';

interface CreateDebtInput {
  clientId: string;
  invoiceId?: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
}

@injectable()
export class CreateDebtUseCase {
  constructor(
    @inject(DEBT_REPOSITORY) private debtRepo: IDebtRepository,
  ) {}

  async execute(input: CreateDebtInput) {
    // Build installment plan
    const installmentAmount = Math.ceil(input.totalAmount / input.installmentCount);
    const plan = Array.from({ length: input.installmentCount }, (_, i) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      return {
        number: i + 1,
        amount: i === input.installmentCount - 1
          ? input.totalAmount - installmentAmount * (input.installmentCount - 1)
          : installmentAmount,
        dueDate: dueDate.toISOString(),
        paid: false,
      };
    });

    const firstDueDate = new Date();
    firstDueDate.setMonth(firstDueDate.getMonth() + 1);

    return this.debtRepo.create({
      description: input.description,
      totalAmount: input.totalAmount,
      remainingAmount: input.totalAmount,
      installmentPlan: plan,
      nextDueDate: firstDueDate,
      client: { connect: { id: input.clientId } },
      ...(input.invoiceId && { invoice: { connect: { id: input.invoiceId } } }),
    });
  }
}

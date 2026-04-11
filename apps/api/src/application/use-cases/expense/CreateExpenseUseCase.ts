import { inject, injectable } from 'tsyringe';
import { EXPENSE_REPOSITORY, type IExpenseRepository } from '../../interfaces/IExpenseRepository';

interface CreateExpenseInput {
  agencyId: string;
  title: string;
  reason: string;
  description?: string;
  category?: string;
  amount: number;
  containerId?: string;
}

@injectable()
export class CreateExpenseUseCase {
  constructor(
    @inject(EXPENSE_REPOSITORY) private expenseRepo: IExpenseRepository,
  ) {}

  async execute(input: CreateExpenseInput, userId: string) {
    return this.expenseRepo.create({
      title: input.title,
      reason: input.reason,
      description: input.description ?? null,
      category: input.category ?? null,
      amount: input.amount,
      agency: { connect: { id: input.agencyId } },
      approvedBy: { connect: { id: userId } },
      ...(input.containerId && { container: { connect: { id: input.containerId } } }),
    });
  }
}

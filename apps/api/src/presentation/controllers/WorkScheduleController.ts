import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

interface DayInput {
  dayOfWeek: number;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number;
  isWorking?: boolean;
}

export class WorkScheduleController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.workSchedule.findMany({
        include: {
          days: { orderBy: { dayOfWeek: 'asc' } },
          _count: { select: { agencies: true, employees: true } },
        },
        orderBy: { name: 'asc' },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await prisma.workSchedule.findUnique({
        where: { id: req.params.id },
        include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      });
      if (!item) throw new NotFoundError('Planning', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, timezone, days } = req.body as {
        name: string;
        description?: string;
        timezone?: string;
        days?: DayInput[];
      };
      if (!name?.trim()) throw new BusinessError('Nom du planning obligatoire');

      const item = await prisma.workSchedule.create({
        data: {
          name: name.trim(),
          description: description?.trim() ?? null,
          timezone: timezone ?? null,
          days: days
            ? { create: days.map((d) => sanitizeDay(d)) }
            : undefined,
        },
        include: { days: true },
      });
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  /** Remplace integralement la liste des jours. */
  static async setDays(req: Request, res: Response, next: NextFunction) {
    try {
      const days = (req.body.days as DayInput[]) ?? [];
      await prisma.$transaction([
        prisma.workScheduleDay.deleteMany({ where: { scheduleId: req.params.id } }),
        prisma.workScheduleDay.createMany({
          data: days.map((d) => ({ scheduleId: req.params.id, ...sanitizeDay(d) })),
        }),
      ]);
      const full = await prisma.workSchedule.findUnique({
        where: { id: req.params.id },
        include: { days: { orderBy: { dayOfWeek: 'asc' } } },
      });
      res.json({ success: true, data: full });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, timezone, isActive } = req.body;
      const item = await prisma.workSchedule.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(timezone !== undefined && { timezone }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const usage = await prisma.workSchedule.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { agencies: true, employees: true } } },
      });
      if (!usage) throw new NotFoundError('Planning', req.params.id);
      const count = (usage._count.agencies ?? 0) + (usage._count.employees ?? 0);
      if (count > 0) {
        throw new BusinessError(`${count} entite(s) utilisent ce planning`);
      }
      await prisma.workSchedule.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /** Assigne le planning a une agence (defaut RH agence). */
  static async assignToAgency(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId, scheduleId } = req.params;
      const item = await prisma.agency.update({
        where: { id: agencyId },
        data: { workScheduleId: scheduleId === 'null' ? null : scheduleId },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  /** Assigne (ou retire) un planning a un employe (override individuel). */
  static async assignToEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId, scheduleId } = req.params;
      const item = await prisma.employee.update({
        where: { id: employeeId },
        data: { scheduleId: scheduleId === 'null' ? null : scheduleId },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }
}

function sanitizeDay(d: DayInput) {
  if (d.dayOfWeek < 0 || d.dayOfWeek > 6) {
    throw new BusinessError(`dayOfWeek invalide: ${d.dayOfWeek}`);
  }
  return {
    dayOfWeek: d.dayOfWeek,
    startTime: d.startTime ?? null,
    endTime: d.endTime ?? null,
    breakMinutes: d.breakMinutes ?? 0,
    isWorking: d.isWorking ?? true,
  };
}

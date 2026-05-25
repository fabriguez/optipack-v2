import { container } from '../../../container';
import { prisma } from '../../../config/database';
import { eventBus, DomainEvents, type DomainEvent } from '../EventBus';
import { DailyReportService } from '../../../application/services/DailyReportService';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('DailyReportRegen');

/**
 * Regenere automatiquement le rapport journalier de l'agence concernee a
 * chaque evenement metier impactant le rapport :
 *  - mouvement caisse (paiement, decaissement, transfert)
 *  - flux colis (creation, chargement, dechargement, livraison, status change)
 *  - mouvement conteneur (depart, arrivee)
 *  - inventaire
 *
 * Strategie de date : on resout la "caisse courante" de l'agence au moment
 * de l'event. Si la caisse du jour est cloturee, findOpenOrLastOpen retourne
 * la caisse du jour ouvrable suivant (qui a ete ouverte par findOrCreateForToday
 * lors de l'action). On regenere le rapport de CETTE date -> les events
 * post-cloture vont dans le rapport du jour suivant comme attendu.
 *
 * Idempotent (upsert sur agencyId+date). Best-effort : echec ne bloque rien.
 *
 * Optimisation : debounce 2s par agencyId+date pour grouper les rafales
 * d'evenements (creation batch de colis, etc.).
 */
const pending = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 2000;

function scheduleRegen(agencyId: string, date: Date): void {
  const dateStr = date.toISOString().slice(0, 10);
  const key = `${agencyId}|${dateStr}`;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(async () => {
    pending.delete(key);
    try {
      const svc = container.resolve(DailyReportService);
      await svc.generate(agencyId, date);
      logger.debug({ agencyId, date: dateStr }, 'Daily report regenerated');
    } catch (err) {
      logger.warn({ err, agencyId, date: dateStr }, 'Daily report regen failed');
    }
  }, DEBOUNCE_MS);
  pending.set(key, timeout);
}

/** Resout la caisse "active" pour le rapport : derniere caisse non cloturee
 *  de l'agence (ou plus recente toutes confondues si tout est cloture). */
async function resolveActiveRegisterDate(agencyId: string): Promise<Date | null> {
  const open = await prisma.agencyCashRegister.findFirst({
    where: { agencyId, isClosed: false },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  if (open) return open.date;
  const last = await prisma.agencyCashRegister.findFirst({
    where: { agencyId },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  return last?.date ?? null;
}

async function handleEvent(event: DomainEvent): Promise<void> {
  const agencyId = (event.payload.agencyId ?? event.payload.arrivalAgencyId ?? event.payload.departureAgencyId) as string | undefined;
  if (!agencyId) return;

  // Si l'event porte deja une date (cas CASH_REGISTER_*), on l'utilise.
  // Sinon on resout via la caisse active de l'agence.
  let date: Date | null = null;
  const dateStr = event.payload.date as string | undefined;
  if (dateStr) {
    date = new Date(dateStr);
  } else {
    date = await resolveActiveRegisterDate(agencyId);
  }
  if (!date) return;
  scheduleRegen(agencyId, date);
}

export function registerDailyReportRegenHandler(): void {
  const triggerEvents = [
    DomainEvents.CASH_REGISTER_UPDATED,
    DomainEvents.CASH_REGISTER_CLOSED,
    DomainEvents.PAYMENT_RECEIVED,
    DomainEvents.PAYMENT_VOIDED,
    DomainEvents.DISBURSEMENT_CREATED,
    DomainEvents.DISBURSEMENT_VOIDED,
    DomainEvents.FUND_TRANSFER_CREATED,
    DomainEvents.FUND_TRANSFER_CONFIRMED,
    DomainEvents.FUND_TRANSFER_VOIDED,
    DomainEvents.PARCEL_CREATED,
    DomainEvents.PARCEL_STATUS_CHANGED,
    DomainEvents.PARCEL_LOADED,
    DomainEvents.PARCEL_UNLOADED,
    DomainEvents.PARCEL_DELIVERED,
    DomainEvents.CONTAINER_DEPARTED,
    DomainEvents.CONTAINER_ARRIVED,
  ];
  for (const ev of triggerEvents) {
    eventBus.on(ev, handleEvent);
  }
  logger.debug({ events: triggerEvents.length }, 'DailyReportRegenHandler registered');
}

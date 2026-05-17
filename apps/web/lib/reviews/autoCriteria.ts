/**
 * Catalogue des criteres d'evaluation calculables automatiquement.
 *
 * Le user admin choisit dans ce catalogue les criteres a inclure dans la
 * grille d'agence ([[AgencyReviewConfigTab]]). Au moment de remplir une
 * evaluation ([[EmployeeReviewsTab]]), les valeurs sont recalculees a la
 * volee depuis les stats de pointage de la periode et figees dans le
 * payload du review (snapshot).
 *
 * Pour ajouter un nouveau critere auto :
 *  1. Ajouter une entree ici (key stable, label, unit, defaultMax, compute).
 *  2. C'est tout : il apparait dans le picker de la grille.
 */

export type AutoCriterionUnit = '%' | 'min' | 'days' | 'count';

export interface AttendanceStatsLike {
  presentDays: number;
  lateDays: number;
  absentDays: number;
  onLeaveDays: number;
  totalLateMinutes: number;
  totalEarlyDepartureMinutes: number;
  totalOvertimeMinutes: number;
  totalUndertimeMinutes: number;
  attendanceRate: number;
}

export interface ExtraStats {
  sanctionsCount?: number;
}

export interface AutoCriterion {
  key: string;
  label: string;
  description: string;
  unit: AutoCriterionUnit;
  defaultMax: number;
  /** True si plus haut = mieux (taux presence, heures sup). False sinon (retards). */
  higherIsBetter: boolean;
  compute: (stats: AttendanceStatsLike, extra: ExtraStats) => number;
}

export const AUTO_CRITERIA: AutoCriterion[] = [
  {
    key: 'attendance_rate',
    label: 'Taux de presence',
    description: 'Pourcentage de jours travailles presents (presents + retards) / jours ouvres.',
    unit: '%',
    defaultMax: 100,
    higherIsBetter: true,
    compute: (s) => s.attendanceRate,
  },
  {
    key: 'present_days',
    label: 'Jours presents',
    description: 'Nombre de jours pointes presents sur la periode.',
    unit: 'days',
    defaultMax: 30,
    higherIsBetter: true,
    compute: (s) => s.presentDays,
  },
  {
    key: 'late_days',
    label: 'Jours en retard',
    description: 'Nombre de jours avec un statut LATE (penalisant).',
    unit: 'days',
    defaultMax: 20,
    higherIsBetter: false,
    compute: (s) => s.lateDays,
  },
  {
    key: 'absent_days',
    label: 'Jours absents',
    description: 'Nombre de jours ABSENT non justifies (penalisant).',
    unit: 'days',
    defaultMax: 20,
    higherIsBetter: false,
    compute: (s) => s.absentDays,
  },
  {
    key: 'total_late_minutes',
    label: 'Retard cumule (min)',
    description: 'Somme des minutes de retard sur la periode.',
    unit: 'min',
    defaultMax: 300,
    higherIsBetter: false,
    compute: (s) => s.totalLateMinutes,
  },
  {
    key: 'total_early_departure_minutes',
    label: 'Depart anticipe cumule (min)',
    description: 'Somme des minutes de depart avant l\'heure planifiee.',
    unit: 'min',
    defaultMax: 300,
    higherIsBetter: false,
    compute: (s) => s.totalEarlyDepartureMinutes,
  },
  {
    key: 'total_overtime_minutes',
    label: 'Heures sup cumulees (min)',
    description: 'Minutes prestees au-dela de l\'horaire planifie.',
    unit: 'min',
    defaultMax: 600,
    higherIsBetter: true,
    compute: (s) => s.totalOvertimeMinutes,
  },
  {
    key: 'total_undertime_minutes',
    label: 'Sous-temps cumule (min)',
    description: 'Total minutes manquantes (retards + departs anticipes).',
    unit: 'min',
    defaultMax: 300,
    higherIsBetter: false,
    compute: (s) => s.totalUndertimeMinutes,
  },
  {
    key: 'sanctions_count',
    label: 'Sanctions sur periode',
    description: 'Nombre de sanctions (avertissement, suspension...) creees pendant la periode.',
    unit: 'count',
    defaultMax: 5,
    higherIsBetter: false,
    compute: (_, extra) => extra.sanctionsCount ?? 0,
  },
];

export const AUTO_CRITERIA_BY_KEY: Record<string, AutoCriterion> = Object.fromEntries(
  AUTO_CRITERIA.map((c) => [c.key, c]),
);

export interface Criterion {
  key: string;
  label: string;
  max: number;
  /** True si valeur est calculee depuis le catalogue auto. */
  auto?: boolean;
  /** Cle catalogue (= [[AutoCriterion.key]]) si auto=true. */
  autoKey?: string;
}

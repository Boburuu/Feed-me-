// Poids : moyenne glissante sur 7 jours et tendance (cahier v2 § 2).
//
// Le poids d'un jour varie de ±1 kg (eau, sel, repas de la veille) : la moyenne des pesées
// des 7 derniers jours lisse ces variations et montre la vraie tendance.

import type { WeightEntry } from "./storage";

const DAY = 86_400_000;
const time = (date: string) => new Date(`${date}T12:00:00`).getTime();

export type WeightPoint = { date: string; kg: number; average: number };

/** Chaque pesée avec la moyenne des pesées des 7 jours qui finissent ce jour-là. */
export function withMovingAverage(weights: WeightEntry[], days = 7): WeightPoint[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((entry) => {
    const end = time(entry.date);
    const window = sorted.filter((other) => time(other.date) <= end && time(other.date) > end - days * DAY);
    const average = window.reduce((sum, other) => sum + other.kg, 0) / window.length;
    return { date: entry.date, kg: entry.kg, average: Math.round(average * 10) / 10 };
  });
}

export const RANGES = [
  { id: "30j", label: "30 j", days: 30 },
  { id: "3m", label: "3 mois", days: 91 },
  { id: "1an", label: "1 an", days: 365 },
  { id: "tout", label: "Tout", days: Infinity },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

/** Pesées de la période (jusqu'à aujourd'hui). */
export function inRange(points: WeightPoint[], range: RangeId, today: string) {
  const days = RANGES.find((item) => item.id === range)!.days;
  return Number.isFinite(days) ? points.filter((point) => time(point.date) > time(today) - days * DAY) : points;
}

/**
 * Tendance sur la période : écart entre la moyenne 7 j de la fin et celle du début, et le
 * même écart ramené à la semaine. Null s'il y a moins de 2 pesées sur 7 jours d'écart.
 */
export function trend(points: WeightPoint[]) {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points.at(-1)!;
  const span = (time(last.date) - time(first.date)) / DAY;
  if (span < 7) return null;
  const change = Math.round((last.average - first.average) * 10) / 10;
  return { change, perWeek: Math.round((change / span) * 7 * 100) / 100, days: Math.round(span) };
}

/** Moyenne 7 j la plus récente (ou null sans pesée dans les 7 derniers jours). */
export function currentAverage(weights: WeightEntry[], today: string) {
  const recent = weights.filter((entry) => time(entry.date) <= time(today) && time(entry.date) > time(today) - 7 * DAY);
  return recent.length ? Math.round((recent.reduce((sum, entry) => sum + entry.kg, 0) / recent.length) * 10) / 10 : null;
}

/** Conseils pour des pesées comparables (affichés avec le suivi du poids). */
export const weighingTips = [
  "Pèse-toi le matin, à jeun, après être allé·e aux toilettes.",
  "Toujours la même balance, posée au même endroit sur un sol dur.",
  "Même tenue (ou sans vêtements) à chaque pesée.",
  "Une ou deux pesées par semaine suffisent, le même jour : c'est la moyenne qui compte.",
  "Un écart d'un jour à l'autre (±1 kg) vient surtout de l'eau : repas salé, sport, cycle.",
];

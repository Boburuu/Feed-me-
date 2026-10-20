// Bilan de la semaine (cahier v2 § 3) : lundi → dimanche, comparé à la semaine précédente.
//
// Ton bienveillant : on commence par ce qui va bien, puis 2 ou 3 pistes, chacune avec une
// action concrète. Moins de 4 jours notés : « données insuffisantes » (un bilan sur 2 jours
// dirait n'importe quoi). Repères : fibres 30 g/jour (ANSES), protéines et calories du plan.

import { isFreeDay } from "./freeDays";
import { itemExtra, itemProtein } from "./foods";
import { hydrationOf } from "./hydration";
import { addDays, eatenMeals, weekStart } from "./planning";
import type { AppData, GoalType } from "./storage";
import { currentAverage } from "./weight";

export const FIBER_GOAL = 30;
const MIN_DAYS = 4;

export type ReportTargets = { kcal: number; protein: number; waterMl: number; stepGoal: number; goal: GoalType };

export type WeekFigures = {
  start: string;
  end: string;
  /** Jours avec au moins un repas noté (hors jours libres). */
  daysLogged: number;
  /** Jours libres (repas libre, calories inconnues) : hors moyennes. */
  freeDays: number;
  /** Jours « complets » : au moins 3 repas notés. */
  completeDays: number;
  kcal: number | null;
  protein: number | null;
  /** Fibres des aliments dont on les connaît (moyenne par jour noté). */
  fiber: number | null;
  waterMl: number | null;
  /** Jours où l'objectif d'hydratation est atteint. */
  waterDays: number;
  steps: number | null;
  sessions: number;
  sessionMinutes: number;
  /** Moyenne 7 j du poids en fin de semaine. */
  weight: number | null;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

export function weekFigures(data: AppData, start: string): WeekFigures {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const end = days[6];
  const meals = eatenMeals(data.meals).filter((meal) => meal.date >= start && meal.date <= end);
  const free = days.filter((day) => isFreeDay(meals, day));
  const logged = days.filter((day) => !free.includes(day) && meals.some((meal) => meal.date === day));
  const perDay = logged.map((day) => {
    const dayMeals = meals.filter((meal) => meal.date === day);
    const items = dayMeals.flatMap((meal) => (meal.items ?? []).map((item) => ({ item, share: meal.plate?.share ?? 1 })));
    const fiberKnown = items.filter(({ item }) => itemExtra(item, "fiber100") !== null);
    return {
      count: dayMeals.length,
      kcal: dayMeals.reduce((sum, meal) => sum + meal.calories, 0),
      protein: dayMeals.reduce((sum, meal) => sum + (meal.protein ?? 0), 0) || items.reduce((sum, { item, share }) => sum + itemProtein(item) * share, 0),
      fiber: fiberKnown.length ? fiberKnown.reduce((sum, { item, share }) => sum + (itemExtra(item, "fiber100") ?? 0) * share, 0) : null,
    };
  });
  const water = days.map((day) => hydrationOf(data, day).totalMl);
  const waterLogged = water.filter((ml) => ml > 0);
  const steps = days.map((day) => data.steps[day]?.count ?? 0).filter((count) => count > 0);
  const sessions = data.sessions.filter((session) => session.date >= start && session.date <= end);
  const fibers = perDay.map((day) => day.fiber).filter((value): value is number => value !== null);
  return {
    start,
    end,
    daysLogged: logged.length,
    freeDays: free.length,
    completeDays: perDay.filter((day) => day.count >= 3).length,
    kcal: average(perDay.map((day) => day.kcal)),
    protein: average(perDay.map((day) => day.protein)),
    fiber: average(fibers),
    waterMl: average(waterLogged),
    waterDays: 0,
    steps: average(steps),
    sessions: sessions.length,
    sessionMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
    weight: currentAverage(data.weights, end),
  };
}

export type WeeklyReport = {
  week: WeekFigures;
  previous: WeekFigures;
  insufficient: boolean;
  good: string[];
  improve: { text: string; action: string }[];
};

const round = (value: number) => Math.round(value).toLocaleString("fr-FR");
const kg = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export function weeklyReport(data: AppData, targets: ReportTargets, start: string): WeeklyReport {
  const week = weekFigures(data, start);
  const previous = weekFigures(data, addDays(start, -7));
  week.waterDays = Array.from({ length: 7 }, (_, index) => addDays(start, index)).filter((day) => hydrationOf(data, day).totalMl >= targets.waterMl).length;
  const insufficient = week.daysLogged < MIN_DAYS;
  const good: string[] = [];
  const improve: { text: string; action: string }[] = [];
  if (insufficient) return { week, previous, insufficient, good, improve };

  // Régularité
  if (week.daysLogged >= 6) good.push(`Tu as noté tes repas ${week.daysLogged} jours sur 7 : c'est ce qui rend le suivi fiable.`);
  else if (week.daysLogged > previous.daysLogged && previous.daysLogged > 0) good.push(`${week.daysLogged} jours notés, contre ${previous.daysLogged} la semaine d'avant : bravo pour la régularité.`);
  if (week.completeDays < week.daysLogged - 1) improve.push({ text: `${week.daysLogged - week.completeDays} jours ont moins de 3 repas notés : certains repas ou collations ont peut-être été oubliés.`, action: "Note chaque repas juste après l'avoir mangé, même un petit en-cas : « Refaire un repas » le fait en un geste." });

  // Calories
  if (week.kcal !== null && targets.kcal > 0) {
    const gap = (week.kcal - targets.kcal) / targets.kcal;
    if (Math.abs(gap) <= 0.1) good.push(`Calories proches de ton objectif : ${round(week.kcal)} kcal par jour en moyenne pour ${round(targets.kcal)} visées.`);
    else if (gap > 0.1 && targets.goal !== "prise") improve.push({ text: `${round(week.kcal)} kcal par jour en moyenne, ${round(week.kcal - targets.kcal)} de plus que ton objectif.`, action: "Repère le repas le plus calorique de la semaine dans le Suivi et prévois une version plus légère pour la semaine qui vient." });
    else if (gap < -0.1 && targets.goal !== "perte") improve.push({ text: `${round(week.kcal)} kcal par jour en moyenne, en dessous de ton objectif de ${round(targets.kcal)}.`, action: "Ajoute une collation (yaourt, fruit, poignée d'oléagineux) l'après-midi." });
    else if (gap < -0.25) improve.push({ text: `${round(week.kcal)} kcal par jour : c'est nettement sous ton objectif (${round(targets.kcal)}), difficile à tenir dans la durée.`, action: "Vérifie que tous tes repas sont notés ; sinon, ajoute une collation pour ne pas te priver." });
  }

  // Protéines
  if (week.protein !== null && targets.protein > 0) {
    if (week.protein >= targets.protein * 0.9) good.push(`Protéines au rendez-vous : ${round(week.protein)} g par jour en moyenne.`);
    else improve.push({ text: `${round(week.protein)} g de protéines par jour, pour ${round(targets.protein)} g visés.`, action: "Ajoute une source de protéines au petit-déjeuner : œufs, fromage blanc, skyr." });
  }

  // Fibres
  if (week.fiber !== null) {
    if (week.fiber >= FIBER_GOAL * 0.8) good.push(`Environ ${round(week.fiber)} g de fibres par jour : proche du repère de ${FIBER_GOAL} g.`);
    else improve.push({ text: `Environ ${round(week.fiber)} g de fibres par jour (repère : ${FIBER_GOAL} g).`, action: "Une portion de légumineuses (lentilles, pois chiches) ou un fruit de plus par jour, et du pain complet." });
  }

  // Hydratation
  if (week.waterDays >= 5) good.push(`Objectif d'hydratation atteint ${week.waterDays} jours sur 7.`);
  else if (week.waterMl !== null) improve.push({ text: `Objectif d'hydratation atteint ${week.waterDays} jour${week.waterDays > 1 ? "s" : ""} sur 7 (${round(week.waterMl)} ml par jour en moyenne).`, action: "Garde une bouteille d'eau à portée de main et bois un verre à chaque repas." });

  // Activité
  if (week.steps !== null && targets.stepGoal > 0 && week.steps >= targets.stepGoal) good.push(`${round(week.steps)} pas par jour en moyenne : objectif de ${round(targets.stepGoal)} atteint.`);
  else if (week.sessions >= 2) good.push(`${week.sessions} séances de sport (${week.sessionMinutes} min) cette semaine.`);
  else if (week.steps !== null && targets.stepGoal > 0) improve.push({ text: `${round(week.steps)} pas par jour en moyenne, pour un objectif de ${round(targets.stepGoal)}.`, action: "Une marche de 15 minutes après le déjeuner ou le dîner, c'est environ 1 500 pas de plus." });

  // Poids (moyenne 7 j) : jamais une alerte, et rien à « corriger » si l'objectif est de maintenir.
  if (week.weight !== null && previous.weight !== null) {
    const change = Math.round((week.weight - previous.weight) * 10) / 10;
    const onTrack = (targets.goal === "perte" && change < 0) || (targets.goal === "prise" && change > 0) || (targets.goal === "maintien" && Math.abs(change) <= 0.5);
    if (onTrack) good.push(targets.goal === "maintien" ? `Poids stable (moyenne 7 j : ${kg(week.weight)} kg).` : `Moyenne 7 j du poids : ${change > 0 ? "+" : "−"}${kg(Math.abs(change))} kg, dans le sens de ton objectif.`);
  }

  // 2 à 4 points positifs, 2 ou 3 pistes : les premiers trouvés, dans l'ordre ci-dessus.
  if (!good.length) good.push(`Tu as noté ${week.daysLogged} jours cette semaine : c'est la base de tout le reste.`);
  return { week, previous, insufficient, good: good.slice(0, 4), improve: improve.slice(0, 3) };
}

/** Semaine du bilan : la semaine en cours le dimanche, sinon la dernière semaine terminée. */
export function reportWeekStart(today: string) {
  const isSunday = new Date(`${today}T12:00:00`).getDay() === 0;
  return isSunday ? weekStart(today) : addDays(weekStart(today), -7);
}

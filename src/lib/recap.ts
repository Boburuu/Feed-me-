// Récapitulatif à télécharger : une période (jour, semaine, mois, dates au choix) et les
// rubriques choisies (repas, nutriments, hydratation, activité, poids, jeûne, résumé).
// Ce fichier rassemble les chiffres ; recapPdf.ts les met en page.

import { sessionLabel } from "./activity";
import { hydrationOf } from "./hydration";
import { addDays, eatenMeals } from "./planning";
import { mealCategories, todayKey, type AppData, type MealCategory } from "./storage";

export type RecapSections = { meals: boolean; nutrients: boolean; water: boolean; activity: boolean; weight: boolean; fasting: boolean; summary: boolean };
export type RecapOptions = { from: string; to: string; sections: RecapSections };

export type RecapMeal = { category: string; name: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null; free: boolean; estimate: number | null };
export type RecapDay = {
  date: string;
  free: boolean;
  meals: RecapMeal[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  waterMl: number;
  steps: number | null;
  sessions: { label: string; minutes: number }[];
  weight: number | null;
  fastHours: number[];
};
export type Recap = {
  from: string;
  to: string;
  days: RecapDay[];
  summary: {
    days: number;
    daysLogged: number;
    freeDays: number;
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    waterMl: number | null;
    steps: number | null;
    sessions: number;
    sessionMinutes: number;
    weightFirst: number | null;
    weightLast: number | null;
  };
};

const order = (category: MealCategory) => mealCategories.findIndex((item) => item.id === category);
const label = (category: MealCategory) => mealCategories.find((item) => item.id === category)?.label ?? category;
const mean = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

/** Jours de la période, du premier au dernier (au plus 10 ans). */
export function periodDays(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 3660; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Chiffres du récapitulatif ; les jours sans rien de noté sont laissés de côté. */
export function buildRecap(data: AppData, { from, to }: Pick<RecapOptions, "from" | "to">): Recap {
  const meals = eatenMeals(data.meals);
  const days = periodDays(from, to).map((date): RecapDay => {
    const dayMeals = meals.filter((meal) => meal.date === date).sort((a, b) => order(a.category) - order(b.category));
    const counted = dayMeals.filter((meal) => !meal.free);
    const weight = data.weights.find((entry) => entry.date === date)?.kg ?? null;
    return {
      date,
      free: dayMeals.some((meal) => meal.free),
      meals: dayMeals.map((meal) => ({
        category: label(meal.category),
        name: meal.name,
        kcal: meal.calories,
        protein: meal.protein ?? null,
        carbs: meal.carbs ?? null,
        fat: meal.fat ?? null,
        free: !!meal.free,
        estimate: meal.freeEstimate ?? null,
      })),
      totals: {
        kcal: counted.reduce((sum, meal) => sum + meal.calories, 0),
        protein: counted.reduce((sum, meal) => sum + (meal.protein ?? 0), 0),
        carbs: counted.reduce((sum, meal) => sum + (meal.carbs ?? 0), 0),
        fat: counted.reduce((sum, meal) => sum + (meal.fat ?? 0), 0),
      },
      waterMl: Math.round(hydrationOf(data, date).totalMl),
      steps: data.steps[date]?.count ?? null,
      sessions: data.sessions.filter((session) => session.date === date).map((session) => ({ label: sessionLabel(session.type), minutes: session.minutes })),
      weight,
      fastHours: data.fasts
        .filter((fast) => fast.end && todayKey(new Date(fast.end)) === date)
        .map((fast) => Math.round(((new Date(fast.end!).getTime() - new Date(fast.start).getTime()) / 3_600_000) * 10) / 10),
    };
  }).filter((day) => day.meals.length || day.waterMl || day.steps || day.sessions.length || day.weight !== null || day.fastHours.length);

  // Moyennes sur les jours notés, hors jours libres (calories inconnues).
  const logged = days.filter((day) => day.meals.length && !day.free);
  const weights = days.filter((day) => day.weight !== null);
  const sessions = days.flatMap((day) => day.sessions);
  return {
    from,
    to,
    days,
    summary: {
      days: periodDays(from, to).length,
      daysLogged: logged.length,
      freeDays: days.filter((day) => day.free).length,
      kcal: mean(logged.map((day) => day.totals.kcal)),
      protein: mean(logged.map((day) => day.totals.protein)),
      carbs: mean(logged.map((day) => day.totals.carbs)),
      fat: mean(logged.map((day) => day.totals.fat)),
      waterMl: mean(days.filter((day) => day.waterMl > 0).map((day) => day.waterMl)),
      steps: mean(days.filter((day) => day.steps).map((day) => day.steps!)),
      sessions: sessions.length,
      sessionMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      weightFirst: weights[0]?.weight ?? null,
      weightLast: weights.at(-1)?.weight ?? null,
    },
  };
}

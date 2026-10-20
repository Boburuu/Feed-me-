// Jours « libres » : un repas libre (chez quelqu'un, cheat meal) rend les calories du jour
// inconnues. Ces jours sortent des moyennes et du bilan, sans casser la série de jours notés.

import { eatenMeals } from "./planning";
import type { Meal } from "./storage";

/** Le jour contient un repas libre mangé. */
export const isFreeDay = (meals: Meal[], day: string) => eatenMeals(meals).some((meal) => meal.date === day && meal.free);

/** « ≈ 900 kcal » ou « libre » pour un repas libre. */
export const freeLabel = (meal: Meal) => (meal.freeEstimate ? `≈ ${meal.freeEstimate}` : "libre");

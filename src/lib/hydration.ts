// Hydratation : eau ajoutée à la main + boissons des repas.
//
// Le volume des boissons n'est jamais recopié : il est recalculé à partir des repas du jour.
// Modifier ou supprimer un repas met donc l'hydratation à jour, et une boisson ne peut pas
// compter deux fois. Seuls les repas notés depuis cette fonction comptent (drinksCounted),
// pour ne pas doubler les verres déjà ajoutés à la main avant.

import { itemGrams, normalize } from "./foods";
import type { AppData, Meal, MealItem } from "./storage";

/** Eau plate ou gazeuse, sans sucre ni arôme : de l'« eau pure ». */
export function isPureWater(item: Pick<MealItem, "name">) {
  const name = normalize(item.name);
  return /^eau\b/.test(name) && !/\b(aromatisee|sucree|coco|de vie|de rose|de fleur)\b/.test(name);
}

/** Aliments qu'on peut choisir de compter comme liquides (soupe, lait…). */
export function couldHydrate(item: Pick<MealItem, "name">) {
  return /\b(soupe|veloute|bouillon|gaspacho|potage|lait|boisson|jus|nectar|smoothie|the|cafe|chocolat chaud|tisane|infusion|kefir|yaourt a boire|sirop|limonade|soda)\b/.test(normalize(item.name));
}

/**
 * Volume compté dans l'hydratation pour un aliment du repas, en ml :
 * - boisson (liquide, ou cochée « compte dans l'hydratation ») : sa quantité en ml ;
 * - part de recette dont le volume final est connu : parts × volume d'une part.
 */
export function drinkMl(item: MealItem) {
  if (item.hydrates === false) return 0;
  if (item.drinkMlPerPart) return item.quantity * item.drinkMlPerPart;
  if (item.liquid || item.hydrates) return itemGrams(item) ?? 0;
  return 0;
}

/** Boissons d'un repas (part de l'assiette maison comprise). */
export function mealDrinks(meal: Meal) {
  if (!meal.drinksCounted || !meal.items) return { totalMl: 0, waterMl: 0 };
  const share = meal.plate?.share ?? 1;
  let totalMl = 0;
  let waterMl = 0;
  for (const item of meal.items) {
    const ml = drinkMl(item) * share;
    totalMl += ml;
    if (isPureWater(item)) waterMl += ml;
  }
  return { totalMl, waterMl };
}

/** Hydratation d'un jour : eau à la main, boissons des repas, eau pure et total. */
export function hydrationOf(data: Pick<AppData, "meals" | "water">, day: string) {
  const manualMl = data.water[day] ?? 0;
  let mealsMl = 0;
  let mealsWaterMl = 0;
  for (const meal of data.meals) {
    if (meal.date !== day) continue;
    const drinks = mealDrinks(meal);
    mealsMl += drinks.totalMl;
    mealsWaterMl += drinks.waterMl;
  }
  return {
    manualMl,
    mealsMl: Math.round(mealsMl),
    pureWaterMl: Math.round(manualMl + mealsWaterMl),
    totalMl: Math.round(manualMl + mealsMl),
  };
}

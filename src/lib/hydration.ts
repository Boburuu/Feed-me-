// Hydratation : eau ajoutée à la main + boissons des repas.
//
// Le volume des boissons n'est jamais recopié : il est recalculé à partir des repas du jour.
// Modifier ou supprimer un repas met donc l'hydratation à jour, et une boisson ne peut pas
// compter deux fois. Seuls les repas notés depuis cette fonction comptent (drinksCounted),
// pour ne pas doubler les verres déjà ajoutés à la main avant.

import { isReadyDrink, itemGrams, normalize } from "./foods";
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

/** Produit sec qui se boit une fois préparé avec de l'eau (thé en sachet, café soluble, sirop…). */
export function isPreparedDrink(item: Pick<MealItem, "name" | "liquid" | "prepared">) {
  // Un thé glacé se boit tel quel, même classé « thés » par Open Food Facts.
  if (isReadyDrink(item.name)) return false;
  if (item.prepared) return true;
  const name = normalize(item.name);
  if (/\bsirop\b/.test(name)) return true;
  if (item.liquid) return false;
  return /\b(the|thes|tisane|tisanes|infusion|infusions|verveine|camomille|rooibos|mate|chicoree|cafe soluble|cafe instantane|cafe moulu|capsules?|dosettes?|nescafe|ricore|cacao en poudre|chocolat en poudre|poudre chocolatee|bouillon cube|cube)\b/.test(name)
    && !/\b(ice tea|the glace|biscuits?|gateau|cake)\b/.test(name);
}

/**
 * Volume compté dans l'hydratation pour un aliment du repas, en ml :
 * - produit préparé avec de l'eau (sachet de thé…) : le volume de la boisson préparée ;
 * - boisson (liquide, ou cochée « compte dans l'hydratation ») : sa quantité en ml ;
 * - part de recette dont le volume final est connu : parts × volume d'une part.
 */
export function drinkMl(item: MealItem) {
  if (item.hydrates === false) return 0;
  if (item.waterMl) return item.waterMl;
  if (item.drinkMlPerPart) return item.quantity * item.drinkMlPerPart;
  if (item.liquid || item.hydrates) return itemGrams(item) ?? 0;
  return 0;
}

/** Boissons d'un repas (part de l'assiette maison comprise). */
export function mealDrinks(meal: Meal) {
  // Une boisson prévue ne compte qu'une fois bue (repas confirmé).
  if (!meal.drinksCounted || !meal.items || meal.status === "planned") return { totalMl: 0, waterMl: 0 };
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

// --- Coefficients d'hydratation -------------------------------------------------------------------
// Part du volume bu qui compte comme hydratation, réglable dans le profil (valeurs du cahier des
// charges ; l'alcool ne compte pas par défaut : il fait plutôt perdre de l'eau).

export const drinkCategories = [
  { id: "eau", label: "Eau", coefficient: 100 },
  { id: "the", label: "Thé, tisane", coefficient: 100 },
  { id: "lait", label: "Lait, chocolat chaud", coefficient: 90 },
  { id: "jus", label: "Jus, smoothie", coefficient: 88 },
  { id: "soda", label: "Soda, boisson énergisante", coefficient: 90 },
  { id: "soupe", label: "Soupe, bouillon", coefficient: 85 },
  { id: "cafe", label: "Café", coefficient: 80 },
  { id: "alcool", label: "Alcool", coefficient: 0 },
  { id: "autre", label: "Autre boisson", coefficient: 100 },
] as const;

export type DrinkCategory = (typeof drinkCategories)[number]["id"];
export type Coefficients = Partial<Record<DrinkCategory, number>>;

/** Type de boisson d'après son nom (le premier qui correspond l'emporte). */
export function drinkCategory(item: Pick<MealItem, "name">): DrinkCategory {
  const name = normalize(item.name);
  if (/\b(biere|vin|cidre|rhum|vodka|whisky|gin|liqueur|pastis|champagne|aperitif|spritz|cocktail alcool)\b/.test(name)) return "alcool";
  if (/\b(cafe|espresso|expresso|cappuccino|latte|ristretto)\b/.test(name)) return "cafe";
  if (/\b(the|tisane|infusion|verveine|camomille)\b/.test(name) && !/\b(ice tea|the glace)\b/.test(name)) return "the";
  if (/\b(lait|chocolat chaud|boisson vegetale|boisson au soja|kefir|yaourt a boire)\b/.test(name)) return "lait";
  if (/\b(jus|nectar|smoothie)\b/.test(name)) return "jus";
  if (/\b(soupe|veloute|bouillon|gaspacho|potage)\b/.test(name)) return "soupe";
  if (/\b(soda|cola|coca|pepsi|limonade|sirop|ice tea|the glace|energisante|monster|red bull|burn|rockstar|kong|hell|orangina|fanta|schweppes|sprite|oasis)\b/.test(name)) return "soda";
  if (isPureWater(item)) return "eau";
  return "autre";
}

export const coefficientOf = (category: DrinkCategory, settings?: Coefficients) =>
  settings?.[category] ?? drinkCategories.find((item) => item.id === category)!.coefficient;

/** Une boisson d'un repas, pour le détail de l'hydratation. */
export type DrinkSource = { mealId: number; index: number; meal: string; name: string; ml: number; countedMl: number; category: DrinkCategory };

/**
 * Hydratation d'un jour : eau ajoutée à la main, boissons des repas (volume réel, et part
 * comptée selon le type de boisson), eau pure et total compté.
 */
export function hydrationOf(data: Pick<AppData, "meals" | "water" | "hydrationCoefficients">, day: string) {
  const manualMl = data.water[day] ?? 0;
  const sources: DrinkSource[] = [];
  let mealsWaterMl = 0;
  for (const meal of data.meals) {
    if (meal.date !== day || !meal.drinksCounted || !meal.items || meal.status === "planned") continue;
    const share = meal.plate?.share ?? 1;
    meal.items.forEach((item, index) => {
      const ml = drinkMl(item) * share;
      if (ml <= 0) return;
      const category = drinkCategory(item);
      sources.push({ mealId: meal.id, index, meal: meal.name, name: item.name, ml, countedMl: (ml * coefficientOf(category, data.hydrationCoefficients)) / 100, category });
      if (isPureWater(item)) mealsWaterMl += ml;
    });
  }
  const mealsMl = sources.reduce((sum, source) => sum + source.ml, 0);
  const countedMl = sources.reduce((sum, source) => sum + source.countedMl, 0);
  return {
    manualMl,
    /** Volume réellement bu aux repas. */
    mealsMl: Math.round(mealsMl),
    /** Ce volume, pondéré par le type de boisson. */
    mealsCountedMl: Math.round(countedMl),
    pureWaterMl: Math.round(manualMl + mealsWaterMl),
    totalMl: Math.round(manualMl + countedMl),
    sources,
  };
}

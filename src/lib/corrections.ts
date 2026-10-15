// Corrections locales d'une fiche produit, d'après son étiquette (cahier § 11).
//
// La fiche d'origine (Open Food Facts, Ciqual…) n'est jamais modifiée : la correction est
// gardée à part, par produit, et prime chaque fois que ce produit est ajouté à un repas ou
// à une recette. Les repas déjà notés ne changent que si l'utilisateur le demande.

import { carbsOf, fatOf, itemCalories, itemProtein, normalize } from "./foods";
import type { AppData, MealItem } from "./storage";

export type ProductCorrection = {
  name: string;
  /** Valeurs de l'étiquette, pour 100 g (ou 100 ml). */
  kcal100: number;
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  sugars100?: number | null;
  satFat100?: number | null;
  fiber100?: number | null;
  salt100?: number | null;
  /** Valeurs de la fiche avant correction, pour pouvoir revenir en arrière. */
  original: { kcal100: number; protein100: number | null; carbs100?: number | null; fat100?: number | null };
  /** Jour de la correction (AAAA-MM-JJ). */
  date: string;
};

export type Corrections = Record<string, ProductCorrection>;

/** Un produit : sa base et son code ; à défaut, son nom. */
export function correctionKey(item: Pick<MealItem, "source" | "ref" | "name">) {
  return item.ref ? `${item.source}:${item.ref}` : `nom:${normalize(item.name)}`;
}

/** Fiche à 100 g comparable à une étiquette (pas une recette, pas une valeur « par portion » seule). */
export function canCheckLabel(item: MealItem) {
  // Un fast-food n'a pas d'étiquette : ses valeurs viennent de la carte de l'enseigne.
  return item.source !== "recette" && item.source !== "enseigne" && !item.ref?.startsWith("reste:") && !(item.unit === "portion" && !item.portionGrams);
}

/** Aliment avec la version corrigée du produit, s'il y en a une. */
export function applyCorrection(item: MealItem, corrections: Corrections | undefined): MealItem {
  const correction = corrections?.[correctionKey(item)];
  if (!correction) return item;
  const { kcal100, protein100, carbs100, fat100 } = correction;
  // Sucres, saturés, fibres, sel : ceux de l'étiquette quand elle les donne.
  const extra = Object.fromEntries((["sugars100", "satFat100", "fiber100", "salt100"] as const).filter((key) => correction[key] !== undefined && correction[key] !== null).map((key) => [key, correction[key]]));
  // La valeur « habituelle » servait à signaler une fiche douteuse : l'étiquette fait foi.
  const { refKcal100: _ref, refName: _name, ...rest } = item;
  return { ...rest, kcal100, protein100, carbs100, fat100, ...extra, corrected: true };
}

/** Repas déjà notés qui contiennent ce produit avec d'autres valeurs que la correction. */
export function mealsWithProduct(meals: AppData["meals"], key: string, correction: Pick<ProductCorrection, "kcal100">) {
  return meals.filter((meal) => meal.items?.some((item) => correctionKey(item) === key && item.kcal100 !== correction.kcal100));
}

/** Recalcule ces repas avec la correction (à la demande de l'utilisateur seulement). */
export function correctPastMeals(data: AppData, key: string, correction: ProductCorrection): AppData {
  const ids = new Set(mealsWithProduct(data.meals, key, correction).map((meal) => meal.id));
  return {
    ...data,
    meals: data.meals.map((meal) => {
      if (!ids.has(meal.id)) return meal;
      const items = meal.items!.map((item) => (correctionKey(item) === key ? applyCorrection(item, { [key]: correction }) : item));
      const share = meal.plate?.share ?? 1;
      return {
        ...meal,
        items,
        calories: Math.round(items.reduce((sum, item) => sum + itemCalories(item), 0) * share),
        protein: Math.round(items.reduce((sum, item) => sum + itemProtein(item), 0) * share) || undefined,
        carbs: Math.round(carbsOf(items).carbs * share),
        fat: Math.round(fatOf(items).fat * share),
      };
    }),
  };
}

/** Degré de confiance d'une fiche, affiché sous l'aliment. */
export function reliabilityOf(item: MealItem): { label: string; tone: "sure" | "community" | "manual" } {
  if (item.corrected) return { label: "corrigé avec l'étiquette", tone: "sure" };
  if (item.labelChecked) return { label: "vérifié avec l'étiquette", tone: "sure" };
  if (item.source === "ciqual") return { label: "vérifié · table Ciqual", tone: "sure" };
  if (item.source === "off") return { label: "communautaire · à vérifier", tone: "community" };
  if (item.source === "perso") return { label: "saisi à la main", tone: "manual" };
  if (item.source === "enseigne") return { label: "officiel · indicatif", tone: "sure" };
  return { label: "calculé d'après la recette", tone: "manual" };
}

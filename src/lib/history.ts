// Ce que j'ai déjà mangé : retrouver un produit noté (« ma soupe Knorr ») et refaire un repas.
//
// Un produit déjà noté revient avec la quantité de la dernière fois, modifiable : on le
// reconnaît à sa marque et à la date, pas à un nom tronqué parmi vingt produits voisins.

import { normalize } from "./foods";
import { isPlanned } from "./planning";
import type { Meal, MealItem } from "./storage";

export type PastFood = { item: MealItem; date: string; meal: string };

/** Produits des repas mangés, du plus récent au plus ancien, chacun une seule fois. */
export function pastFoods(meals: Meal[]): PastFood[] {
  const seen = new Set<string>();
  const list: PastFood[] = [];
  for (const meal of [...meals].filter((entry) => !isPlanned(entry)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
    for (const item of meal.items ?? []) {
      // Un reste n'existe plus une fois mangé : on ne le repropose pas.
      if (item.ref?.startsWith("reste:")) continue;
      const key = `${item.source}|${item.ref ?? normalize(item.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ item, date: meal.date, meal: meal.name });
    }
  }
  return list;
}

/** « soupe courgette » trouve « Soupe Courgettes · Knorr » : chaque mot cherché commence un mot du nom. */
export function searchPast(foods: PastFood[], query: string, limit = 5) {
  const words = normalize(query).split(" ").filter((word) => word.length >= 2);
  if (!words.length) return [];
  return foods.filter(({ item }) => {
    const name = normalize(`${item.name} ${item.matchedName ?? ""}`).split(" ");
    return words.every((word) => name.some((part) => part.startsWith(word) || (word.length >= 4 && part.startsWith(word.replace(/s$/, "")))));
  }).slice(0, limit);
}

const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Quantité notée, lisible : « 200 ml », « 1 sachet », « 2 × 1 pêche ». */
export function amountLabel(item: MealItem) {
  if (item.unit === "g") return `${n(Math.round(item.quantity))} ${item.liquid ? "ml" : "g"}`;
  const label = (item.portionLabel ?? "1 portion").replace(/^1\s+/, "");
  return item.quantity === 1 ? `1 ${label}` : `${n(item.quantity)} × ${label}`;
}

/** Repas récents différents (par nom), pour « Refaire un repas ». */
export function recentMeals(meals: Meal[], limit = 5) {
  const seen = new Set<string>();
  return [...meals]
    .filter((meal) => !isPlanned(meal) && meal.items?.length)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .filter((meal) => {
      const key = normalize(meal.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/**
 * Aliments d'un repas à refaire. Assiette maison : seule la part mangée est reprise
 * (soupe 200 ml × 50 % → 100 ml), chaque ligne reste modifiable.
 */
export function repeatItems(meal: Meal): MealItem[] {
  const share = meal.plate?.share ?? 1;
  return (meal.items ?? [])
    .filter((item) => !item.ref?.startsWith("reste:"))
    .map((item) => {
      if (share === 1) return { ...item };
      const quantity = item.unit === "g" ? Math.round(item.quantity * share) : Math.round(item.quantity * share * 100) / 100;
      return { ...item, quantity, ...(item.waterMl ? { waterMl: Math.round(item.waterMl * share) } : {}) };
    });
}

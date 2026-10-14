// Planification des repas et liste de courses.
//
// Un repas prévu (status « planned ») n'est jamais compté comme mangé : ni calories, ni
// glucides, ni hydratation, ni statistiques. Il le devient seulement quand l'utilisateur
// confirme « J'ai mangé » (en ajustant la quantité s'il en a mangé moins).

import { itemGrams, normalize } from "./foods";
import { todayKey, type Meal, type MealItem, type Recipe } from "./storage";

export const isPlanned = (meal: Meal) => meal.status === "planned";
/** Repas réellement mangés : les seuls comptés dans le journal et les statistiques. */
export const eatenMeals = (meals: Meal[]) => meals.filter((meal) => !isPlanned(meal));

export function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

/** Lundi de la semaine d'un jour. */
export function weekStart(key: string) {
  const day = new Date(`${key}T12:00:00`).getDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
}

export const weekDays = (start: string) => Array.from({ length: 7 }, (_, index) => addDays(start, index));

/** Prévu et mangé d'un jour, comptés séparément. */
export function dayTotals(meals: Meal[], day: string) {
  const ofDay = meals.filter((meal) => meal.date === day);
  const sum = (list: Meal[]) => list.reduce((total, meal) => total + meal.calories, 0);
  return { plannedKcal: sum(ofDay.filter(isPlanned)), eatenKcal: sum(eatenMeals(ofDay)), meals: ofDay };
}

/** Copie d'un repas, prévue pour un autre jour (jamais comptée comme mangée d'office). */
export function planCopy(meal: Meal, date: string, id: number): Meal {
  const { drinksCounted: _drinks, ...rest } = meal;
  return { ...rest, id, date, status: "planned" };
}

/** Une journée entière copiée vers un autre jour, en repas prévus. */
export function copyDay(meals: Meal[], from: string, to: string, firstId: number): Meal[] {
  return meals.filter((meal) => meal.date === from).map((meal, index) => planCopy(meal, to, firstId + index));
}

// --- Liste de courses ------------------------------------------------------------------------------

export type ShoppingLine = {
  /** Identifiant stable (nom normalisé) : sert à garder les cases cochées. */
  key: string;
  name: string;
  /** Quantités par unité : on n'additionne que ce qui s'additionne (g avec g, ml avec ml…). */
  amounts: { unit: string; quantity: number }[];
  /** Repas et recettes qui l'utilisent. */
  from: string[];
};

const massUnits: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const volumeUnits: Record<string, number> = { ml: 1, cl: 10, dl: 100, L: 1000 };

/** « 2 kg » → 2000 g, « 33 cl » → 330 ml ; les autres unités restent telles quelles. */
function toBase(quantity: number, unit: string) {
  if (massUnits[unit]) return { quantity: quantity * massUnits[unit], unit: "g" };
  if (volumeUnits[unit]) return { quantity: quantity * volumeUnits[unit], unit: "ml" };
  return { quantity, unit: unit.replace(/s$/, "") };
}

/** Nom d'achat : sans marque ni précision, au singulier (« Bananes (mûres) · X » → « banane »). */
function shoppingKey(name: string) {
  const base = normalize(name.split(" · ")[0].replace(/\([^)]*\)/g, " ").split(/\s+ou\s+/i)[0]);
  return base.split(" ").map((word) => (word.length > 3 ? word.replace(/[sx]$/, "") : word)).join(" ").trim();
}

const genericLabel = /^(portion|part|assiette|bol|verre|tasse|canette|bouteille|boite|emballage)/;

/**
 * Liste de courses des repas prévus entre deux jours (inclus). Les recettes sont
 * remplacées par leurs ingrédients, au prorata des parts prévues ; une assiette maison
 * compte en entier (on achète pour tout le plat). Les ingrédients identiques sont
 * regroupés, sans conversion hasardeuse : 200 g + 2 tranches restent deux quantités.
 */
export function shoppingList(meals: Meal[], recipes: Recipe[], from: string, to: string): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>();
  const add = (name: string, quantity: number | null, unit: string, source: string) => {
    const key = shoppingKey(name);
    if (!key) return;
    const line = lines.get(key) ?? { key, name: name.split(" · ")[0].replace(/\s*\([^)]*\)/g, "").trim(), amounts: [], from: [] };
    if (quantity !== null && quantity > 0) {
      const amount = toBase(quantity, unit);
      const same = line.amounts.find((item) => item.unit === amount.unit);
      if (same) same.quantity += amount.quantity;
      else line.amounts.push(amount);
    }
    if (!line.from.includes(source)) line.from.push(source);
    lines.set(key, line);
  };
  const addItem = (item: MealItem, factor: number, source: string) => {
    const grams = itemGrams(item);
    const label = (item.portionLabel ?? "").replace(/^1\s+/, "").replace(/\s*\(.*$/, "");
    if (item.unit === "portion" && label && !genericLabel.test(normalize(label))) add(item.name, item.quantity * factor, label, source);
    else if (grams !== null) add(item.name, grams * factor, item.liquid ? "ml" : "g", source);
    else add(item.name, null, "", source);
  };

  for (const meal of meals) {
    if (!isPlanned(meal) || meal.date < from || meal.date > to) continue;
    for (const item of meal.items ?? []) {
      const recipe = item.source === "recette" ? recipes.find((entry) => String(entry.id) === item.ref) : undefined;
      if (!recipe) { addItem(item, 1, meal.name); continue; }
      // Parts prévues sur le nombre de personnes de la recette.
      const factor = item.quantity / (recipe.portions || 1);
      for (const ingredient of recipe.ingredients.flatMap((group) => group.items)) {
        if (ingredient.food) addItem({ ...ingredient.food, name: ingredient.name }, factor, recipe.name);
        else add(ingredient.name, ingredient.quantity === null ? null : ingredient.quantity * factor, ingredient.unit, recipe.name);
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** « 450 g », « 1,2 kg », « 3 tranches », « 750 ml + 2 canettes ». */
export function formatAmounts(amounts: ShoppingLine["amounts"]) {
  const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 });
  return amounts.map(({ unit, quantity }) => {
    if (unit === "g") return quantity >= 1000 ? `${n(quantity / 1000)} kg` : `${n(Math.round(quantity))} g`;
    if (unit === "ml") return quantity >= 1000 ? `${n(quantity / 1000)} L` : `${n(Math.round(quantity))} ml`;
    if (!unit) return n(quantity);
    return `${n(quantity)} ${unit}${quantity > 1 && !/[sx]$/.test(unit) && !unit.includes(" ") ? "s" : ""}`;
  }).join(" + ");
}

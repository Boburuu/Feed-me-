// Complète les glucides et lipides des repas et recettes enregistrés avant leur suivi.
//
// Chaque aliment garde sa source (code Ciqual, code-barres, boisson de la liste…) : on
// relit ses valeurs au même endroit, puis on recalcule le repas. Un aliment introuvable
// reçoit « null » (inconnu) pour ne pas être recherché à chaque ouverture. Seules les
// valeurs manquantes sont ajoutées : les calories des repas ne changent jamais.

import { energyDrinks } from "./energyDrinks";
import { carbsOf, ciqualNutrients, fatOf, loadCiqual, normalize, openFoodFactsNutrients } from "./foods";
import { matchIngredient } from "./ingredientMatch";
import { ingredientsNutrition } from "./recipes";
import type { AppData, Ingredient, MealItem } from "./storage";

type Nutrients = { carbs: number | null; fat: number | null };
const unknown: Nutrients = { carbs: null, fat: null };

async function nutrientsFor(item: MealItem, data: AppData): Promise<Nutrients> {
  const ref = item.ref ?? "";
  if (item.source === "ciqual" && /^\d+/.test(ref)) return ciqualNutrients(Number(ref.split(":")[0]));
  if (item.source === "off" && ref.startsWith("energie:")) {
    const drink = energyDrinks.find((entry) => `energie:${normalize(entry.name).replace(/ /g, "-")}` === ref);
    return drink ? { carbs: drink.carbs100, fat: 0 } : unknown;
  }
  if (item.source === "off" && /^\d+$/.test(ref)) return navigator.onLine ? openFoodFactsNutrients(ref).catch(() => unknown) : unknown;
  if (item.source === "recette") {
    const recipe = data.recipes.find((entry) => String(entry.id) === ref);
    return { carbs: recipe?.carbs ?? null, fat: recipe?.fat ?? null };
  }
  if (item.source === "perso" && !ref.startsWith("reste:")) {
    const food = data.customFoods.find((entry) => String(entry.id) === ref);
    return { carbs: food?.carbs100 ?? null, fat: food?.fat100 ?? null };
  }
  return unknown;
}

const missing = (item: MealItem) => item.carbs100 === undefined || item.fat100 === undefined;

/** Valeurs manquantes (« undefined ») complétées ; celles déjà connues ne changent pas. */
async function completed(item: MealItem, data: AppData, cache: Map<string, Nutrients>): Promise<MealItem> {
  if (!missing(item)) return item;
  const key = `${item.source}|${item.ref ?? item.name}`;
  if (!cache.has(key)) cache.set(key, await nutrientsFor(item, data));
  const found = cache.get(key)!;
  return { ...item, carbs100: item.carbs100 === undefined ? found.carbs : item.carbs100, fat100: item.fat100 === undefined ? found.fat : item.fat100 };
}

const needsUpdate = (items: MealItem[] | undefined) => !!items?.some(missing);
const foodsOf = (recipe: AppData["recipes"][number]) => recipe.ingredients.flatMap((group) => group.items.flatMap((item) => (item.food ? [item.food] : [])));

/** Repas et recettes à compléter ; null s'il n'y a rien à faire. */
export async function backfillCarbs(data: AppData) {
  const meals = data.meals.filter((meal) => needsUpdate(meal.items));
  const recipes = data.recipes.filter((recipe) => recipe.carbs === undefined || recipe.fat === undefined || needsUpdate(foodsOf(recipe)));
  if (!meals.length && !recipes.length) return null;
  const cache = new Map<string, Nutrients>();

  type RecipeUpdate = { ingredients: AppData["recipes"][number]["ingredients"]; carbs?: number; fat?: number };
  const recipeUpdates = new Map<number, RecipeUpdate>();
  for (const recipe of recipes) {
    const ingredients = await Promise.all(recipe.ingredients.map(async (group) => ({
      ...group,
      items: await Promise.all(group.items.map(async (item) => (item.food ? { ...item, food: await completed(item.food, data, cache) } : item))),
    })));
    // Par personne, seulement si la recette n'en avait pas déjà (saisis à la main).
    const guess = recipe.carbs === undefined || recipe.fat === undefined ? await estimate(ingredients.flatMap((group) => group.items), recipe.portions) : null;
    recipeUpdates.set(recipe.id, { ingredients, carbs: recipe.carbs ?? guess?.carbs, fat: recipe.fat ?? guess?.fat });
  }

  // Les repas « Ma recette » lisent les valeurs des recettes qu'on vient de compléter.
  const withRecipes: AppData = { ...data, recipes: data.recipes.map((recipe) => ({ ...recipe, carbs: recipe.carbs ?? recipeUpdates.get(recipe.id)?.carbs, fat: recipe.fat ?? recipeUpdates.get(recipe.id)?.fat })) };

  const mealUpdates = new Map<number, { items: MealItem[]; carbs: number; fat: number }>();
  for (const meal of meals) {
    const items = await Promise.all(meal.items!.map((item) => completed(item, withRecipes, cache)));
    const share = meal.plate?.share ?? 1;
    mealUpdates.set(meal.id, { items, carbs: Math.round(carbsOf(items).carbs * share), fat: Math.round(fatOf(items).fat * share) });
  }

  /** À appliquer sur les données les plus récentes (l'utilisateur a pu agir entre-temps). */
  return (current: AppData): AppData => ({
    ...current,
    meals: current.meals.map((meal) => {
      const update = mealUpdates.get(meal.id);
      return update && needsUpdate(meal.items) ? { ...meal, ...update } : meal;
    }),
    recipes: current.recipes.map((recipe) => {
      const update = recipeUpdates.get(recipe.id);
      if (!update) return recipe;
      return {
        ...recipe,
        ingredients: update.ingredients,
        ...(recipe.carbs === undefined && update.carbs !== undefined ? { carbs: update.carbs } : {}),
        ...(recipe.fat === undefined && update.fat !== undefined ? { fat: update.fat } : {}),
      };
    }),
  });
}

/**
 * Glucides et lipides par personne d'une recette : ingrédients choisis dans les bases, et
 * ingrédients écrits retrouvés comme avec « Calculer avec les ingrédients écrits ». Rien si
 * moins de 60 % des ingrédients mesurés sont retrouvés : l'estimation serait trop incomplète.
 */
async function estimate(items: Ingredient[], portions: number) {
  const measured = items.filter((item) => item.food || item.quantity !== null);
  if (!measured.length) return null;
  const foods = await Promise.all(measured.map((item) => (item.food ? Promise.resolve(item.food) : matchIngredient(item).catch(() => null))));
  const found = foods.filter((food): food is MealItem => !!food);
  if (found.length < measured.length * 0.6) return null;
  const totals = ingredientsNutrition(found.map((food) => ({ name: food.name, quantity: null, unit: "", food })));
  return { carbs: Math.round(totals.carbs / (portions || 1)), fat: Math.round(totals.fat / (portions || 1)) };
}

// --- Sucres, AG saturés, fibres et sel des aliments Ciqual déjà notés ---------------------------
// Ajoutés à la table embarquée en octobre 2026 : les repas notés avant reçoivent ces valeurs
// (lues dans la même fiche Ciqual). Rien d'autre ne change.

const EXTRA_KEYS = ["sugars100", "satFat100", "fiber100", "salt100"] as const;
const needsExtras = (item: MealItem) => item.source === "ciqual" && /^\d+/.test(item.ref ?? "") && item.fiber100 === undefined;

export async function backfillExtras(data: AppData) {
  const touched = (items: MealItem[] | undefined) => !!items?.some(needsExtras);
  if (!data.meals.some((meal) => touched(meal.items)) && !data.recipes.some((recipe) => touched(foodsOf(recipe)))) return null;
  const { rows } = await loadCiqual();
  const byCode = new Map(rows.map((row) => [row[0], row]));
  const complete = (item: MealItem): MealItem => {
    if (!needsExtras(item)) return item;
    const row = byCode.get(Number(item.ref!.split(":")[0]));
    if (!row) return { ...item, sugars100: null, satFat100: null, fiber100: null, salt100: null };
    const values = [row[7], row[8], row[9], row[10]];
    return { ...item, ...Object.fromEntries(EXTRA_KEYS.map((key, index) => [key, values[index] ?? null])) };
  };
  return (current: AppData): AppData => ({
    ...current,
    meals: current.meals.map((meal) => (touched(meal.items) ? { ...meal, items: meal.items!.map(complete) } : meal)),
    recipes: current.recipes.map((recipe) => (touched(foodsOf(recipe))
      ? { ...recipe, ingredients: recipe.ingredients.map((group) => ({ ...group, items: group.items.map((item) => (item.food ? { ...item, food: complete(item.food) } : item)) })) }
      : recipe)),
  });
}

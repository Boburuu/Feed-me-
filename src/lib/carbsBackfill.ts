// Complète les glucides des repas et recettes enregistrés avant leur suivi.
//
// Chaque aliment garde sa source (code Ciqual, code-barres, boisson de la liste…) : on
// relit ses glucides au même endroit, puis on recalcule le repas. Un aliment introuvable
// reçoit « null » (inconnu) pour ne pas être recherché à chaque ouverture.

import { energyDrinks } from "./energyDrinks";
import { carbsOf, ciqualCarbs, normalize, openFoodFactsCarbs } from "./foods";
import { matchIngredient } from "./ingredientMatch";
import { ingredientsNutrition } from "./recipes";
import type { AppData, Ingredient, MealItem } from "./storage";

async function carbsFor(item: MealItem, data: AppData): Promise<number | null> {
  const ref = item.ref ?? "";
  if (item.source === "ciqual" && /^\d+/.test(ref)) return ciqualCarbs(Number(ref.split(":")[0]));
  if (item.source === "off" && ref.startsWith("energie:")) {
    return energyDrinks.find((drink) => `energie:${normalize(drink.name).replace(/ /g, "-")}` === ref)?.carbs100 ?? null;
  }
  if (item.source === "off" && /^\d+$/.test(ref)) return navigator.onLine ? openFoodFactsCarbs(ref).catch(() => null) : null;
  if (item.source === "recette") return data.recipes.find((recipe) => String(recipe.id) === ref)?.carbs ?? null;
  if (item.source === "perso" && !ref.startsWith("reste:")) return data.customFoods.find((food) => String(food.id) === ref)?.carbs100 ?? null;
  return null;
}

/** Glucides manquants (« undefined ») complétés ; l'aliment est renvoyé tel quel s'ils sont déjà connus. */
async function withCarbs(item: MealItem, data: AppData, cache: Map<string, number | null>): Promise<MealItem> {
  if (item.carbs100 !== undefined) return item;
  const key = `${item.source}|${item.ref ?? item.name}`;
  if (!cache.has(key)) cache.set(key, await carbsFor(item, data));
  return { ...item, carbs100: cache.get(key) ?? null };
}

const needsCarbs = (items: MealItem[] | undefined) => !!items?.some((item) => item.carbs100 === undefined);

/** Repas et recettes à compléter ; null s'il n'y a rien à faire. */
export async function backfillCarbs(data: AppData) {
  const meals = data.meals.filter((meal) => needsCarbs(meal.items));
  const recipes = data.recipes.filter((recipe) => recipe.carbs === undefined || needsCarbs(recipe.ingredients.flatMap((group) => group.items.flatMap((item) => (item.food ? [item.food] : [])))));
  if (!meals.length && !recipes.length) return null;
  const cache = new Map<string, number | null>();

  const recipeUpdates = new Map<number, { ingredients: AppData["recipes"][number]["ingredients"]; carbs?: number }>();
  for (const recipe of recipes) {
    const ingredients = await Promise.all(recipe.ingredients.map(async (group) => ({
      ...group,
      items: await Promise.all(group.items.map(async (item) => (item.food ? { ...item, food: await withCarbs(item.food, data, cache) } : item))),
    })));
    // Glucides par personne, seulement si la recette n'en avait pas déjà (saisis à la main).
    recipeUpdates.set(recipe.id, { ingredients, carbs: recipe.carbs ?? (await estimateCarbs(ingredients.flatMap((group) => group.items), recipe.portions)) });
  }

  // Les repas « Ma recette » lisent les glucides des recettes qu'on vient de compléter.
  const withRecipes: AppData = { ...data, recipes: data.recipes.map((recipe) => ({ ...recipe, carbs: recipe.carbs ?? recipeUpdates.get(recipe.id)?.carbs })) };

  const mealUpdates = new Map<number, { items: MealItem[]; carbs: number }>();
  for (const meal of meals) {
    const items = await Promise.all(meal.items!.map((item) => withCarbs(item, withRecipes, cache)));
    mealUpdates.set(meal.id, { items, carbs: Math.round(carbsOf(items).carbs * (meal.plate?.share ?? 1)) });
  }

  /** À appliquer sur les données les plus récentes (l'utilisateur a pu agir entre-temps). */
  return (current: AppData): AppData => ({
    ...current,
    meals: current.meals.map((meal) => {
      const update = mealUpdates.get(meal.id);
      return update && needsCarbs(meal.items) ? { ...meal, ...update } : meal;
    }),
    recipes: current.recipes.map((recipe) => {
      const update = recipeUpdates.get(recipe.id);
      return update ? { ...recipe, ingredients: update.ingredients, ...(update.carbs !== undefined ? { carbs: update.carbs } : {}) } : recipe;
    }),
  });
}

/**
 * Glucides par personne d'une recette : ingrédients choisis dans les bases, et ingrédients
 * écrits retrouvés comme avec « Calculer avec les ingrédients écrits ». Rien si moins de
 * 60 % des ingrédients mesurés sont retrouvés : l'estimation serait trop incomplète.
 */
async function estimateCarbs(items: Ingredient[], portions: number) {
  const measured = items.filter((item) => item.food || item.quantity !== null);
  if (!measured.length) return undefined;
  const foods = await Promise.all(measured.map((item) => (item.food ? Promise.resolve(item.food) : matchIngredient(item).catch(() => null))));
  const found = foods.filter((food): food is MealItem => !!food);
  if (found.length < measured.length * 0.6) return undefined;
  return Math.round(ingredientsNutrition(found.map((food) => ({ name: food.name, quantity: null, unit: "", food }))).carbs / (portions || 1));
}

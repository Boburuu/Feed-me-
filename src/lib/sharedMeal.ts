// Repas reçu en partage : à noter comme repas, comme assiette maison, ou à garder comme recette.

import { ingredientFromItem } from "./recipes";
import { computedPerPerson } from "./recipeNutrition";
import type { SharedMeal } from "./share";
import type { MealItem, Recipe } from "./storage";

export type ReceivedMeal = SharedMeal & { items: MealItem[] };

/** « Penne poulet (200 g sur 900 g) » → « Penne poulet ». */
export const cleanMealName = (name: string) => name.replace(/^Assiette maison : /, "").replace(/\s*\([^)]*\bsur\b[^)]*\)\s*$/, "").trim() || name;

/**
 * Ce qui a été mangé, aliment par aliment : pour une assiette partagée (plat entier + part
 * mangée), les quantités du plat sont ramenées à la part.
 */
export function eatenItems(meal: ReceivedMeal): MealItem[] {
  const share = meal.plate?.share ?? 1;
  if (share === 1) return meal.items;
  return meal.items.map((item) => ({ ...item, quantity: Math.round(item.quantity * share * 100) / 100 }));
}

/**
 * Recette tirée d'un repas reçu, à vérifier et compléter dans le formulaire :
 * - une recette partagée telle quelle (une seule ligne « recette ») redevient la recette
 *   entière, avec son nombre de parts et son poids ;
 * - une assiette garde le plat entier et son nombre de personnes ;
 * - un repas simple devient une recette pour 1 personne, avec les quantités mangées.
 */
export function recipeFromMeal(meal: ReceivedMeal, id = Date.now()): Recipe {
  const [only] = meal.items;
  const wholeRecipe = meal.items.length === 1 && only.source === "recette" && only.recipePortions;
  const portions = wholeRecipe ? only.recipePortions! : meal.plate?.servings ?? 1;
  const items = wholeRecipe
    ? [{ ...only, quantity: only.recipePortions!, recipeCount: undefined }]
    : meal.items;
  const recipe: Recipe = {
    id,
    name: cleanMealName(meal.name),
    category: "plat",
    ingredients: [{ title: "", items: items.map(ingredientFromItem) }],
    steps: [],
    time: 15,
    portions,
    calories: 0,
    protein: 0,
    ...(wholeRecipe && only.recipeGrams && !only.recipeGramsEstimated ? { totalGrams: only.recipeGrams } : {}),
  };
  const computed = computedPerPerson(recipe);
  return computed ? { ...recipe, calories: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat } : recipe;
}

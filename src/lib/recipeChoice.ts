// Changer l'ingrédient « au choix » d'une recette enregistrée (« crevettes ou poulet ou tofu »).

import { itemCalories, itemCarbs, itemProtein } from "./foods";
import { matchChoice } from "./ingredientMatch";
import { ingredientFromItem } from "./recipes";
import type { MealItem, Recipe } from "./storage";

/**
 * Nouvelle version de la recette avec ce choix, au même poids. Les valeurs par personne
 * sont corrigées de la différence entre l'ancien et le nouvel ingrédient : celles écrites
 * par l'auteur de la recette restent la base. Null si le choix est introuvable.
 */
export async function applyChoice(recipe: Recipe, group: number, index: number, choice: string): Promise<Recipe | null> {
  const old = recipe.ingredients[group]?.items[index]?.food;
  if (!old) return null;
  const food = await matchChoice(old, choice);
  if (!food) return null;
  const portions = recipe.portions || 1;
  const change = (value: (item: MealItem) => number | null) => ((value(food) ?? 0) - (value(old) ?? 0)) / portions;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((part, g) => (g !== group ? part : {
      ...part,
      items: part.items.map((item, i) => (i !== index ? item : ingredientFromItem(food))),
    })),
    ...(recipe.calories ? { calories: Math.max(0, Math.round(recipe.calories + change(itemCalories))) } : {}),
    ...(recipe.calories ? { protein: Math.max(0, Math.round(recipe.protein + change(itemProtein))) } : {}),
    ...(recipe.carbs !== undefined ? { carbs: Math.max(0, Math.round(recipe.carbs + change(itemCarbs))) } : {}),
  };
}

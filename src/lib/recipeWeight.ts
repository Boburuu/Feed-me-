// Poids d'un plat entier, estimé d'après ses ingrédients (pour « j'en ai mangé 250 g »).
//
// Estimation : la cuisson fait perdre de l'eau (ou en ajoute, pour les pâtes). Le mieux
// reste de peser le plat ; l'utilisateur corrige le poids, qui est gardé avec la recette.

import { itemGrams } from "./foods";
import { matchIngredient } from "./ingredientMatch";
import type { Recipe } from "./storage";

const metric: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, L: 1000 };

export async function estimateRecipeWeight(recipe: Recipe): Promise<number | null> {
  let total = 0;
  for (const item of recipe.ingredients.flatMap((group) => group.items)) {
    if (item.food) { total += itemGrams(item.food) ?? 0; continue; }
    if (item.quantity === null) continue;
    if (metric[item.unit]) { total += item.quantity * metric[item.unit]; continue; }
    // « 2 bananes », « 1 tranche » : poids habituel de la pièce.
    const food = await matchIngredient(item).catch(() => null);
    total += food ? itemGrams(food) ?? 0 : 0;
  }
  return total > 0 ? Math.round(total / 10) * 10 : null;
}

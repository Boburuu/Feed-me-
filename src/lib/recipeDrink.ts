// Recette qui se boit (chocolat chaud, smoothie, soupe…) : volume bu compté dans l'hydratation.
//
// Le volume final saisi dans la recette l'emporte. Sinon, pour une boisson, on additionne ses
// ingrédients liquides (250 ml de lait, 20 cl d'eau). Un gâteau avec du lait ne compte pas.

import type { Recipe } from "./storage";

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DRINK_NAME = /\b(chocolat chaud|cafe|the|tisane|infusion|smoothie|milkshake|milk shake|jus|limonade|citronnade|boisson|cocktail|lassi|latte|cappuccino|soupe|veloute|bouillon|potage|gaspacho)\b/;
/** Millilitres par unité de volume écrite. */
const ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 };

/** La recette se boit : rangée en « Boisson », ou son nom le dit. */
export function isDrinkRecipe(recipe: Pick<Recipe, "name" | "category">) {
  return recipe.category === "boisson" || DRINK_NAME.test(plain(recipe.name));
}

/** Volume du plat entier en ml, s'il se boit et qu'on peut le connaître ; sinon undefined. */
export function recipeVolumeMl(recipe: Pick<Recipe, "name" | "category" | "volumeMl" | "ingredients">) {
  if (recipe.volumeMl) return recipe.volumeMl;
  if (!isDrinkRecipe(recipe)) return undefined;
  let total = 0;
  for (const item of recipe.ingredients.flatMap((group) => group.items)) {
    if (item.food) {
      if (item.food.liquid && item.food.unit === "g") total += item.food.quantity;
    } else if (item.quantity && ML[plain(item.unit)]) {
      total += item.quantity * ML[plain(item.unit)];
    }
  }
  return total > 0 ? Math.round(total) : undefined;
}

/** Millilitres bus par part de la recette, s'ils sont connus. */
export function recipeMlPerPart(recipe: Pick<Recipe, "name" | "category" | "volumeMl" | "ingredients" | "portions">) {
  const volume = recipeVolumeMl(recipe);
  return volume ? volume / (recipe.portions || 1) : undefined;
}

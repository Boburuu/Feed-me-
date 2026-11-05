import type { IconName } from "../components/Icon";
import type { Meal, MealCategory, Recipe } from "./storage";

/** Les moments de la journée, dans l'ordre où ils arrivent. */
export const HOME_MEAL_ORDER: MealCategory[] = ["petit-dejeuner", "dejeuner", "collation", "diner"];

export const mealGlyph: Record<MealCategory, IconName> = { "petit-dejeuner": "coffee", dejeuner: "bowl", collation: "cookie", diner: "moon" };

/** Photo de la recette d'un repas, si elle en a une. */
export function mealImageId(meal: Meal, recipes: Recipe[]) {
  const ref = meal.items?.find((item) => item.source === "recette")?.ref;
  return ref ? recipes.find((recipe) => String(recipe.id) === ref)?.images?.[0] : undefined;
}

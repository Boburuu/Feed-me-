// Valeurs d'une recette : un seul calcul, partagé par la fiche, le formulaire et le journal.
//
// Somme des ingrédients choisis dans les bases (chacun avec sa quantité), divisée UNE fois
// par le nombre de personnes. Les valeurs saisies à la main (étiquette, site de la recette)
// restent prioritaires, mais un écart fort avec les ingrédients est signalé.
//
// Cause du bug « Sandwich 21 kcal/pers. » : les valeurs calculées à la première sauvegarde
// (1 tranche de jambon + 1 tranche de pain) étaient ensuite traitées comme saisies à la main
// et ne suivaient plus les quantités modifiées (4 et 8). Désormais, une recette dont les
// valeurs viennent du calcul (nutritionManual absent) est recalculée à chaque sauvegarde.

import { carbsOf, fatOf, itemCalories, itemProtein } from "./foods";
import { ingredientsNutrition } from "./recipes";
import type { AppData, Meal, Recipe } from "./storage";

export type PerPerson = { kcal: number; protein: number; carbs: number; fat: number };

/** Ingrédients de toutes les parties de la recette. */
const allIngredients = (recipe: Pick<Recipe, "ingredients">) => recipe.ingredients.flatMap((group) => group.items);

/** Valeurs par personne d'après les ingrédients (null si aucun ingrédient n'a de fiche). */
export function computedPerPerson(recipe: Pick<Recipe, "ingredients" | "portions">): (PerPerson & { known: number; total: number; totalKcal: number }) | null {
  const items = allIngredients(recipe);
  const computed = ingredientsNutrition(items);
  if (!computed.known) return null;
  const portions = recipe.portions > 0 ? recipe.portions : 1;
  return {
    kcal: Math.round(computed.kcal / portions),
    protein: Math.round(computed.protein / portions),
    carbs: Math.round(computed.carbs / portions),
    fat: Math.round(computed.fat / portions),
    known: computed.known,
    total: items.length,
    totalKcal: Math.round(computed.kcal),
  };
}

/**
 * Écart fort entre les calories de la fiche et celles des ingrédients (plus de 15 % et de
 * 20 kcal par personne) : la fiche est à vérifier. Seulement quand tous les ingrédients ont
 * une fiche, sinon le calcul est forcément incomplet.
 */
export function recipeMismatch(recipe: Recipe) {
  const computed = computedPerPerson(recipe);
  if (!computed || computed.known < computed.total) return null;
  const gap = Math.abs(computed.kcal - recipe.calories);
  if (gap <= 20 || gap <= 0.15 * Math.max(computed.kcal, recipe.calories)) return null;
  return { stored: recipe.calories, computed };
}

/** La recette avec les valeurs recalculées d'après ses ingrédients (redevenues automatiques). */
export function recalculatedRecipe(recipe: Recipe): Recipe {
  const computed = computedPerPerson(recipe);
  if (!computed) return recipe;
  return { ...recipe, calories: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat, nutritionManual: undefined };
}

/** Repas déjà notés avec cette recette, dont les valeurs diffèrent de la fiche actuelle. */
export function mealsWithRecipe(meals: Meal[], recipe: Recipe) {
  return meals.filter((meal) => meal.items?.some((item) => item.source === "recette" && item.ref === String(recipe.id) && item.kcal100 !== recipe.calories));
}

/** Recalcule ces repas avec la fiche actuelle (à la demande de l'utilisateur seulement). */
export function updateMealsWithRecipe(data: AppData, recipe: Recipe): AppData {
  const ids = new Set(mealsWithRecipe(data.meals, recipe).map((meal) => meal.id));
  return {
    ...data,
    meals: data.meals.map((meal) => {
      if (!ids.has(meal.id)) return meal;
      const items = meal.items!.map((item) => (item.source === "recette" && item.ref === String(recipe.id)
        ? { ...item, kcal100: recipe.calories, protein100: recipe.protein, carbs100: recipe.carbs ?? null, fat100: recipe.fat ?? null }
        : item));
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

/** Champs du formulaire (texte saisi ; vide = calcul automatique). */
export type NutritionFields = { calories: string; protein: string; carbs: string; fat: string };

const num = (text: string) => Number(text.replace(",", "."));

/**
 * Le formulaire s'ouvre avec des champs vides (calcul automatique) quand les valeurs de la
 * recette viennent du calcul : saisies à la main, elles sont affichées pour être modifiées.
 */
export function initialFields(recipe?: Recipe): NutritionFields {
  if (!recipe) return { calories: "", protein: "", carbs: "", fat: "" };
  const computed = computedPerPerson(recipe);
  const automatic = !recipe.nutritionManual && computed !== null
    && (recipe.calories === computed.kcal || !recipe.calories);
  if (automatic) return { calories: "", protein: "", carbs: "", fat: "" };
  return {
    calories: recipe.calories ? String(recipe.calories) : "",
    protein: recipe.calories ? String(recipe.protein) : "",
    carbs: recipe.carbs !== undefined ? String(recipe.carbs) : "",
    fat: recipe.fat !== undefined ? String(recipe.fat) : "",
  };
}

/**
 * Valeurs enregistrées : un champ rempli l'emporte, un champ vide prend le calcul d'après
 * les ingrédients (divisé une seule fois par le nombre de personnes). Des valeurs saisies
 * identiques au calcul restent automatiques.
 */
export function savedNutrition(fields: NutritionFields, computed: PerPerson | null): Pick<Recipe, "calories" | "protein" | "carbs" | "fat" | "nutritionManual"> {
  const typed = (["calories", "protein", "carbs", "fat"] as const).filter((key) => fields[key].trim() !== "");
  const value = (key: keyof NutritionFields, auto: number | undefined) => (fields[key].trim() !== "" ? num(fields[key]) : auto);
  const manual = typed.length > 0 && !(computed && typed.every((key) => num(fields[key]) === computed[key === "calories" ? "kcal" : key]));
  return {
    calories: value("calories", computed?.kcal) || 0,
    protein: value("protein", computed?.protein) || 0,
    carbs: value("carbs", computed?.carbs),
    fat: value("fat", computed?.fat),
    ...(manual ? { nutritionManual: true } : {}),
  };
}

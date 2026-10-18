// Cas « Sandwich » (17/10/2026) : fiche à 21 kcal/pers. alors que les ingrédients font 776 kcal.
import { describe, expect, it } from "vitest";
import { itemCalories, toMealItem } from "./foods";
import { ingredientFromItem } from "./recipes";
import { computedPerPerson, initialFields, mealsWithRecipe, recalculatedRecipe, recipeMismatch, savedNutrition, updateMealsWithRecipe } from "./recipeNutrition";
import type { AppData, MealItem, Recipe } from "./storage";

/** Aliment par portion, valeurs pour 100 g (fiche Open Food Facts telle qu'affichée). */
const food = (name: string, kcal100: number, portionGrams: number, quantity: number, extra: Partial<MealItem> = {}): MealItem => ({
  name, source: "off", ref: name, kcal100, protein100: 10, carbs100: 5, fat100: 2,
  unit: "portion", quantity, portionGrams, portionLabel: `1 portion (${portionGrams} g)`, ...extra,
});
// Les trois ingrédients tels qu'ils apparaissent dans la fiche (198 + 287 + 291 = 776 kcal).
const jambon = food("Jambon", 110, 45, 4);          // 180 g → 198 kcal
const fromage = food("Fromage", 287 / 134 * 100, 16.75, 8); // 134 g → 287 kcal
const pain = food("Pain", 97, 37.5, 8);             // 300 g → 291 kcal

const sandwich = (items: MealItem[], extra: Partial<Recipe> = {}): Recipe => ({
  id: 42, name: "Sandwich", steps: [], time: 15, portions: 4,
  ingredients: [{ title: "", items: items.map(ingredientFromItem) }],
  calories: 21, protein: 3, carbs: 2, fat: 0, ...extra,
});

describe("recette Sandwich : 776 kcal, 4 parts", () => {
  it("additionne les ingrédients avec leurs quantités", () => {
    expect(Math.round(itemCalories(jambon) + itemCalories(fromage) + itemCalories(pain))).toBe(776);
    expect(computedPerPerson(sandwich([jambon, fromage, pain]))?.totalKcal).toBe(776);
  });
  it("divise une seule fois par le nombre de parts : 194 kcal la part", () => {
    expect(computedPerPerson(sandwich([jambon, fromage, pain]))?.kcal).toBe(194);
  });
  it("2 parts sur 4 = 388 kcal dans le journal", () => {
    const recipe = recalculatedRecipe(sandwich([jambon, fromage, pain]));
    const line: MealItem = { name: "Sandwich", source: "recette", ref: "42", quantity: 2, unit: "portion", kcal100: recipe.calories, protein100: recipe.protein, recipePortions: 4 };
    expect(itemCalories(line)).toBe(388);
  });
  it("change avec le nombre de parts (2 parts : 388 kcal la part)", () => {
    expect(computedPerPerson(sandwich([jambon, fromage, pain], { portions: 2 }))?.kcal).toBe(388);
  });
  it("convertit grammes et portions de la même façon", () => {
    const enGrammes = { ...pain, unit: "g" as const, quantity: 300 };
    expect(itemCalories(enGrammes)).toBeCloseTo(itemCalories(pain), 6);
  });
});

describe("cause du bug : valeurs calculées une fois puis figées", () => {
  // Première sauvegarde : 1 tranche de jambon + 1 tranche de pain → ≈ 21 kcal/pers.
  const premier = sandwich([{ ...jambon, quantity: 1 }, { ...pain, quantity: 1 }]);
  it("reproduit les 21 kcal de la première sauvegarde", () => {
    expect(computedPerPerson(premier)?.kcal).toBe(21);
  });
  it("une recette calculée s'ouvre avec des champs vides (recalculée à la sauvegarde)", () => {
    expect(initialFields({ ...premier, calories: 21 })).toEqual({ calories: "", protein: "", carbs: "", fat: "" });
  });
  it("champs vides : la sauvegarde reprend le calcul des ingrédients modifiés", () => {
    const modifie = sandwich([jambon, fromage, pain]);
    expect(savedNutrition({ calories: "", protein: "", carbs: "", fat: "" }, computedPerPerson(modifie))).toMatchObject({ calories: 194 });
  });
  it("une valeur saisie à la main reste prioritaire et marque la recette", () => {
    expect(savedNutrition({ calories: "250", protein: "", carbs: "", fat: "" }, computedPerPerson(sandwich([jambon, fromage, pain])))).toMatchObject({ calories: 250, nutritionManual: true });
  });
  it("une saisie identique au calcul reste automatique", () => {
    const computed = computedPerPerson(sandwich([jambon, fromage, pain]))!;
    expect(savedNutrition({ calories: String(computed.kcal), protein: "", carbs: "", fat: "" }, computed).nutritionManual).toBeUndefined();
  });
});

describe("contrôle et recalcul de la fiche", () => {
  const faux = sandwich([jambon, fromage, pain]);
  it("signale une fiche très différente de la somme des ingrédients", () => {
    expect(recipeMismatch(faux)).toMatchObject({ stored: 21, computed: { kcal: 194 } });
    expect(recipeMismatch({ ...faux, calories: 190 })).toBeNull();
  });
  it("ne signale rien si un ingrédient n'a pas de fiche (calcul incomplet)", () => {
    const partiel = { ...faux, ingredients: [{ title: "", items: [...faux.ingredients[0].items, { name: "Moutarde", quantity: null, unit: "" }] }] };
    expect(recipeMismatch(partiel)).toBeNull();
  });
  it("sans données nutritionnelles : pas de calcul inventé", () => {
    expect(computedPerPerson({ ingredients: [{ title: "", items: [{ name: "Pain", quantity: 2, unit: "tranches" }] }], portions: 4 })).toBeNull();
  });
  it("valeur aberrante d'une fiche : comptée telle quelle, à corriger avec l'étiquette", () => {
    // Pain Lidl : la fiche dit 97 kcal/100 g, l'étiquette 258 (97 kcal par tranche de 37,5 g).
    const corrige = { ...pain, kcal100: 258 };
    expect(Math.round(itemCalories(corrige) / 8)).toBe(97);
  });
  it("met à jour les repas déjà notés seulement à la demande", () => {
    const recipe = recalculatedRecipe(faux);
    const data = { meals: [{ id: 1, date: "2026-10-17", category: "diner", name: "Sandwich", calories: 42, source: "recipe", items: [{ name: "Sandwich", source: "recette", ref: "42", quantity: 2, unit: "portion", kcal100: 21, protein100: 3, recipePortions: 4 }] }] } as unknown as AppData;
    expect(mealsWithRecipe(data.meals, recipe)).toHaveLength(1);
    expect(updateMealsWithRecipe(data, recipe).meals[0].calories).toBe(388);
  });
});

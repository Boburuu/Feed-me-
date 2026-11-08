import { describe, expect, it } from "vitest";
import { recipeMlPerPart, recipeVolumeMl } from "./recipeDrink";
import { matchIngredient } from "./ingredientMatch";
import { parseIngredientLine } from "./recipes";
import { recipeResult } from "./foods";
import { drinkMl } from "./hydration";
import type { Recipe } from "./storage";

const written = (lines: string[]) => [{ title: "", items: lines.map(parseIngredientLine) }];
const recipe = (change: Partial<Recipe>): Recipe => ({ id: 1, name: "Chocolat chaud", portions: 1, time: 5, calories: 160, protein: 8, steps: [], ingredients: written(["250 ml de lait demi-écrémé", "10 g de cacao en poudre"]), ...change });

describe("recette qui se boit", () => {
  it("compte le lait d'un chocolat chaud écrit à la main", () => {
    expect(recipeVolumeMl(recipe({}))).toBe(250);
    expect(recipeMlPerPart(recipe({ portions: 2, ingredients: written(["50 cl de lait", "2 c. à soupe de cacao"]) }))).toBe(250);
  });

  it("compte le lait choisi dans la base", () => {
    const ingredients = [{ title: "", items: [{ name: "lait", quantity: 200, unit: "ml", food: { name: "Lait demi-écrémé", source: "ciqual" as const, kcal100: 46, protein100: 3.3, quantity: 200, unit: "g" as const, liquid: true } }] }];
    expect(recipeVolumeMl(recipe({ ingredients }))).toBe(200);
  });

  it("le volume saisi l'emporte", () => {
    expect(recipeVolumeMl(recipe({ volumeMl: 300 }))).toBe(300);
  });

  it("ne compte pas le lait d'un gâteau", () => {
    expect(recipeVolumeMl(recipe({ name: "Gâteau au yaourt", ingredients: written(["20 cl de lait", "200 g de farine"]) }))).toBeUndefined();
  });

  it("une part ajoutée à un repas compte dans l'hydratation", () => {
    const item = { ...recipeResult(recipe({})), quantity: 1, unit: "portion" as const };
    expect(drinkMl(item as never)).toBe(250);
  });
});

describe("cacao", () => {
  it("le cacao en poudre d'une recette n'est pas un chocolat chaud préparé", async () => {
    const cacao = await matchIngredient(parseIngredientLine("10 g de cacao en poudre"));
    expect(cacao?.kcal100).toBeGreaterThan(350);
    expect(cacao?.liquid).toBeFalsy();
    const plain = await matchIngredient(parseIngredientLine("2 c. à café de cacao"));
    expect(plain?.kcal100).toBeGreaterThan(350);
  });
}, 60000);

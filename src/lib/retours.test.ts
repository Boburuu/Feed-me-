// Retours du 17 octobre : coin des conseils, recette comptée en morceaux ou en grammes.
import { describe, expect, it } from "vitest";
import { dailyTip, recentTips } from "./tips";
import { itemCalories, itemGrams, recipeResult, toMealItem } from "./foods";
import { checkPayload, mealPayload } from "./share";
import type { Meal, Recipe } from "./storage";

const recipe: Recipe = { id: 7, name: "Gratin de courgettes", ingredients: [], steps: [], time: 30, portions: 4, calories: 300, protein: 12, pieces: 8, totalGrams: 1200 };

describe("coin des conseils", () => {
  it("donne le conseil du jour en premier, sans doublon", () => {
    const list = recentTips("2026-10-17");
    expect(list[0]).toEqual({ tip: dailyTip("2026-10-17"), date: "2026-10-17" });
    expect(list[1].date).toBe("2026-10-16");
    expect(new Set(list.map((entry) => entry.tip.id)).size).toBe(list.length);
  });
});

describe("recette comptée en morceaux ou en grammes", () => {
  const item = toMealItem(recipeResult(recipe));
  it("garde la taille du plat entier de la recette", () => {
    expect(item).toMatchObject({ unit: "portion", quantity: 1, recipePortions: 4, recipePieces: 8, recipeGrams: 1200 });
  });
  it("compte toujours en parts : 300 g sur 1 200 g = 1 part", () => {
    const eaten = { ...item, quantity: 300 / (1200 / 4), recipeCount: "grams" as const };
    expect(itemGrams(eaten)).toBe(300);
    expect(itemCalories(eaten)).toBe(300);
  });
  it("2 morceaux sur 8 = 1 part", () => {
    const eaten = { ...item, quantity: 2 / (8 / 4), recipeCount: "pieces" as const };
    expect(itemCalories(eaten)).toBe(300);
  });
  it("passe le partage", () => {
    const meal: Meal = { id: 1, date: "2026-10-17", category: "dejeuner", name: recipe.name, calories: 300, protein: 12, source: "manual", items: [{ ...item, recipeCount: "grams" }] };
    const back = checkPayload(JSON.parse(JSON.stringify(mealPayload(meal))));
    expect(back.kind === "repas" && back.meal.items?.[0]).toMatchObject({ recipePieces: 8, recipeGrams: 1200, recipeCount: "grams" });
  });
});

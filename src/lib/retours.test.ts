// Retours du 17 octobre : coin des conseils, recette comptée en morceaux ou en grammes.
import { describe, expect, it } from "vitest";
import { dailyTip, recentTips } from "./tips";
import { itemCalories, itemGrams, needsPortionWeight, recipeResult, toMealItem, withPortionWeight } from "./foods";
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
    expect(item).toMatchObject({ unit: "portion", recipePortions: 4, recipePieces: 8, recipeGrams: 1200 });
  });
  it("coupée en morceaux : 1 morceau par défaut (fudge en 9, 1 morceau sur 9)", () => {
    expect(item).toMatchObject({ recipeCount: "pieces", quantity: 0.5 });
    const fudge = toMealItem(recipeResult({ ...recipe, portions: 1, pieces: 9, calories: 1404 }));
    expect(Math.round(itemCalories(fudge))).toBe(156);
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

describe("poids d'une portion ajouté à la main", () => {
  const cookie = toMealItem({ name: "Cookie", source: "enseigne", ref: "subway:cookie", kcal100: 232, protein100: null, carbs100: null, fat100: null, perPortionOnly: true, portionLabel: "1 cookie", detail: "Subway" });
  it("ne concerne que les aliments comptés par portion sans poids", () => {
    expect(needsPortionWeight(cookie)).toBe(true);
    expect(needsPortionWeight(toMealItem(recipeResult(recipe)))).toBe(false);
  });
  it("garde les calories de la portion et permet les grammes", () => {
    const weighed = { ...cookie, ...withPortionWeight(cookie, 58) };
    expect(needsPortionWeight(weighed)).toBe(false);
    expect(weighed.portionLabel).toBe("1 cookie (58 g)");
    expect(Math.round(itemCalories(weighed))).toBe(232);
    expect(Math.round(itemCalories({ ...weighed, unit: "g", quantity: 29 }))).toBe(116);
    expect(weighed.protein100).toBeNull();
  });
});

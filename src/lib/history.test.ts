// Retours d'usage : retrouver un produit déjà noté, refaire un repas, thé en sachet.
import { describe, expect, it } from "vitest";
import { amountLabel, pastFoods, recentMeals, repeatItems, searchPast } from "./history";
import { drinkMl, hydrationOf, isPreparedDrink } from "./hydration";
import { defaultDensity, itemExtra, nutrientGrams, offDrink } from "./foods";
import type { Meal, MealItem } from "./storage";

// La soupe Knorr de Camille, notée deux fois le 14 (en mug, puis dans une assiette pour 2).
const knorr: MealItem = { name: "Soupe Courgettes · Knorr", source: "off", ref: "8712566213757", quantity: 200, unit: "g", kcal100: 45, protein100: 1, liquid: true, portionGrams: 200, portionLabel: "1 verre" };
const saumon: MealItem = { name: "Pavés de saumon à la provençale", source: "off", ref: "2872149038965", quantity: 150, unit: "g", kcal100: 269, protein100: 20 };
const autres = Array.from({ length: 8 }, (_, i): MealItem => ({ name: `Produit ${i}`, source: "ciqual", ref: String(i), quantity: 100, unit: "g", kcal100: 50, protein100: 1 }));
const meals: Meal[] = [
  { id: 1, date: "2026-10-14", category: "dejeuner", name: "Soupe Courgettes, Riz", calories: 300, source: "manual", items: [{ ...knorr, quantity: 214, portionLabel: "1 mug" }] },
  { id: 2, date: "2026-10-14", category: "diner", name: "Assiette maison : Soupe Courgettes, Pavés de saumon", calories: 247, source: "manual", items: [knorr, saumon], plate: { servings: 2, share: 0.5 } },
  // Une journée chargée ensuite : la soupe sort des « récemment utilisés ».
  { id: 3, date: "2026-10-15", category: "dejeuner", name: "Divers", calories: 400, source: "manual", items: autres },
  { id: 4, date: "2026-10-16", category: "diner", name: "Prévu", calories: 100, source: "manual", status: "planned", items: [{ ...autres[0], name: "Soupe courgette prévue", ref: "x" }] },
];

describe("retrouver un produit déjà noté", () => {
  it("« soupe courgette » retrouve la soupe Knorr, même loin dans l'historique", () => {
    const found = searchPast(pastFoods(meals), "soupe courgette");
    expect(found).toHaveLength(1);
    expect(found[0].item.name).toBe("Soupe Courgettes · Knorr");
    // La plus récente des deux fois (le dîner), avec sa quantité.
    expect(found[0].date).toBe("2026-10-14");
    expect(amountLabel(found[0].item)).toBe("200 ml");
  });

  it("un repas seulement prévu ne compte pas comme déjà mangé", () => {
    expect(searchPast(pastFoods(meals), "prevue")).toHaveLength(0);
  });
});

describe("refaire un repas", () => {
  it("assiette maison : la part mangée est reprise (200 ml × 50 % = 100 ml)", () => {
    const items = repeatItems(meals[1]);
    expect(items.map((item) => item.quantity)).toEqual([100, 75]);
    expect(items[0]).toMatchObject({ liquid: true, portionLabel: "1 verre" });
  });

  it("repas récents : du plus récent au plus ancien, sans les repas prévus", () => {
    expect(recentMeals(meals).map((meal) => meal.id)).toEqual([3, 2, 1]);
  });
});

describe("thé en sachet", () => {
  const sachet: MealItem = { name: "Thé Earl Grey Empress · Marks & Spencer", source: "off", ref: "00735346", quantity: 1, unit: "portion", kcal100: 1, protein100: 0, portionGrams: 2, portionLabel: "1 sachet" };

  it("un sachet de thé, un café soluble ou un sirop se préparent avec de l'eau", () => {
    expect(isPreparedDrink(sachet)).toBe(true);
    expect(isPreparedDrink({ name: "Sirop de grenadine", liquid: true })).toBe(true);
    expect(isPreparedDrink({ name: "Nescafé café soluble" })).toBe(true);
    expect(isPreparedDrink({ name: "Lipton Ice Tea pêche", liquid: true })).toBe(false);
    expect(isPreparedDrink({ name: "Biscuits au thé matcha" })).toBe(false);
  });

  it("c'est le mug préparé qui compte, pas les 2 g du sachet", () => {
    expect(drinkMl({ ...sachet, hydrates: true })).toBe(2);
    expect(drinkMl({ ...sachet, waterMl: 250 })).toBe(250);
    const day = hydrationOf({ meals: [{ id: 9, date: "2026-10-15", category: "dejeuner", name: "Thé", calories: 0, source: "manual", drinksCounted: true, items: [{ ...sachet, waterMl: 250 }] }], water: {} }, "2026-10-15");
    expect(day.totalMl).toBe(250);
    expect(day.sources[0].category).toBe("the");
  });
});

describe("unités et densité", () => {
  it("Open Food Facts : une catégorie « boissons » suffit, un thé en sachet se prépare", () => {
    expect(offDrink("125 g (50 sachets)", ["en:beverages", "en:beverage-preparations", "en:teas"])).toEqual({ prepared: true });
    expect(offDrink("1 kg", ["en:beverages", "en:fruit-juices"])).toEqual({ liquid: true });
    expect(offDrink("1000 ml", ["en:soups"])).toEqual({ liquid: true });
    expect(offDrink("400 g", ["en:soups"])).toEqual({});
  });

  it("lait Ciqual (pour 100 g) : 250 ml × 1,03 = 257,5 g comptés", () => {
    const lait: MealItem = { name: "Lait demi-écrémé, UHT", source: "ciqual", ref: "19041", quantity: 250, unit: "g", liquid: true, kcal100: 46, protein100: 3.3, density: defaultDensity("Lait demi-écrémé, UHT") };
    expect(lait.density).toBe(1.03);
    expect(nutrientGrams(lait)).toBeCloseTo(257.5);
    // L'hydratation compte le volume bu, pas le poids.
    expect(drinkMl(lait)).toBe(250);
    expect(defaultDensity("Boisson à l'amande")).toBeUndefined();
  });
});

describe("fibres d'un aliment", () => {
  it("80 g de lentilles corail sèches = 12,3 g de fibres", () => {
    const lentilles: MealItem = { name: "Lentille corail, sèche", source: "ciqual", ref: "20535", quantity: 80, unit: "g", kcal100: 328, protein100: 27.7, fiber100: 15.4, sugars100: 1.29 };
    expect(itemExtra(lentilles, "fiber100")).toBeCloseTo(12.32);
    expect(itemExtra({ ...lentilles, salt100: undefined }, "salt100")).toBeNull();
  });
});

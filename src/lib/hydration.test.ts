// Hydratation (cahier § 3.4) : boissons des repas, sans doublon, eau pure à part.
import { describe, expect, it } from "vitest";
import { drinkMl, hydrationOf, isPureWater } from "./hydration";
import type { Meal, MealItem } from "./storage";

const day = "2026-10-14";
const canette: MealItem = { name: "Monster Ultra Rosá", source: "off", ref: "energie:x", quantity: 1, unit: "portion", portionGrams: 500, portionLabel: "1 canette", liquid: true, kcal100: 2.8, protein100: 0 };
const meal = (id: number, items: MealItem[], extra: Partial<Meal> = {}): Meal => ({ id, date: day, category: "collation", name: "x", calories: 0, source: "manual", items, drinksCounted: true, ...extra });

describe("boissons des repas", () => {
  it("une canette de 500 ml ajoutée à un repas compte une seule fois 500 ml", () => {
    const data = { water: {}, meals: [meal(1, [canette])] };
    expect(hydrationOf(data, day)).toMatchObject({ mealsMl: 500, totalMl: 500 });
    // Recalculer encore ne crée aucun doublon.
    expect(hydrationOf(data, day).totalMl).toBe(500);
  });

  it("une boisson n'est pas de l'eau pure ; l'eau, si", () => {
    const eau: MealItem = { name: "Eau", source: "ciqual", quantity: 1, unit: "portion", portionGrams: 200, liquid: true, kcal100: 0, protein100: 0 };
    const data = { water: { [day]: 1000 }, meals: [meal(1, [canette, eau])] };
    expect(hydrationOf(data, day)).toEqual({ manualMl: 1000, mealsMl: 700, pureWaterMl: 1200, totalMl: 1700 });
    expect(isPureWater({ name: "Eau gazeuse" })).toBe(true);
    expect(isPureWater({ name: "Eau aromatisée sucrée" })).toBe(false);
  });

  it("smoothie maison de 600 ml en 2 portions : 1 portion bue = 300 ml", () => {
    const part: MealItem = { name: "Smoothie", source: "recette", quantity: 1, unit: "portion", kcal100: 150, protein100: 2, drinkMlPerPart: 300, recipePortions: 2 };
    expect(drinkMl(part)).toBe(300);
    expect(drinkMl({ ...part, quantity: 2 })).toBe(600);
  });

  it("supprimer le repas retire la boisson ; modifier la quantité met à jour", () => {
    expect(hydrationOf({ water: {}, meals: [] }, day).totalMl).toBe(0);
    expect(hydrationOf({ water: {}, meals: [meal(1, [{ ...canette, quantity: 0.5 }])] }, day).totalMl).toBe(250);
  });

  it("un aliment solide ne compte pas ; une soupe cochée « boisson », si", () => {
    const soupe: MealItem = { name: "Soupe de légumes", source: "ciqual", quantity: 250, unit: "g", kcal100: 30, protein100: 1 };
    expect(drinkMl(soupe)).toBe(0);
    expect(drinkMl({ ...soupe, hydrates: true })).toBe(250);
    expect(drinkMl({ ...canette, hydrates: false })).toBe(0);
  });

  it("les repas notés avant la fonction ne comptent pas (verres déjà ajoutés à la main)", () => {
    expect(hydrationOf({ water: {}, meals: [meal(1, [canette], { drinksCounted: undefined })] }, day).totalMl).toBe(0);
  });

  it("assiette maison : seule la part mangée compte", () => {
    expect(hydrationOf({ water: {}, meals: [meal(1, [canette], { plate: { servings: 2, share: 0.5 } })] }, day).totalMl).toBe(250);
  });

  it("un autre jour n'est pas compté", () => {
    expect(hydrationOf({ water: {}, meals: [meal(1, [canette], { date: "2026-10-13" })] }, day).totalMl).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { cookedFactor, offDryHint } from "./dryGoods";
import { toMealItem, itemCalories, type FoodResult } from "./foods";

describe("féculents vendus secs", () => {
  it.each(["Serpentini", "Serpentini n°42", "Tortiglioni", "Conchiglie", "Orecchiette", "Pâtes complètes", "Spaghettis", "Penne rigate"])("reconnaît %s", (name) => {
    expect(cookedFactor(name, 356)?.label).toBe("pâtes");
  });

  it.each(["Pâte à tartiner", "Pâtes de fruits", "Pâte feuilletée", "Pâté de campagne", "Pâté", "Sauce pour pâtes", "Serpentini cuits"])("ne touche pas à %s", (name) => {
    expect(cookedFactor(name, 500)).toBeNull();
  });

  it("laisse tranquilles des pâtes fraîches ou déjà cuites", () => {
    expect(cookedFactor("Serpentini", 150)).toBeNull();
  });

  it("se sert de la catégorie Open Food Facts quand le nom ne dit rien", () => {
    expect(cookedFactor("Barilla n°73", 356)).toBeNull();
    expect(offDryHint(["en:cereals", "en:pastas", "en:dry-pastas"])).toBe("pates");
    expect(cookedFactor("Barilla n°73", 356, "pates")?.label).toBe("pâtes");
    expect(offDryHint(["en:pasta-sauces"])).toBeUndefined();
  });

  it("compte 225 g de serpentini cuits, pas 225 g secs", () => {
    const result = { name: "Serpentini", source: "off", ref: "x", kcal100: 356, protein100: 12, carbs100: 72, fat100: 1.5 } as FoodResult;
    const item = { ...toMealItem(result), quantity: 225, unit: "g" as const };
    expect(Math.round(itemCalories(item))).toBe(801);
    expect(itemCalories({ ...item, weighedCooked: true })).toBeLessThan(400);
  });
});

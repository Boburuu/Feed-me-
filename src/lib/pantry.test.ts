// « Mes ingrédients » : jambon Herta gardé, compté à la tranche.
import { describe, expect, it } from "vitest";
import { itemCalories, toMealItem } from "./foods";
import { pantryResult, toPantry, withPieceSize } from "./pantry";
import type { MealItem } from "./storage";

const jambon: MealItem = { name: "Jambon Le Bon Paris · Herta", source: "off", ref: "3154230802235", kcal100: 110, protein100: 21, quantity: 35, unit: "g", recipeCount: "grams", hydrates: false };

describe("mes ingrédients", () => {
  const kept = toPantry(jambon, 1, "2026-10-25");
  it("garde le produit sans la quantité du repas", () => {
    expect(kept).toMatchObject({ pantryId: 1, unit: "g", quantity: 100, ref: "3154230802235" });
    expect(kept.recipeCount).toBeUndefined();
    expect(kept.hydrates).toBeUndefined();
  });
  it("paquet de 4 tranches, 160 g : 1 tranche = 40 g", () => {
    const sized = withPieceSize(kept, { label: "tranche", count: 4, packageGrams: 160 });
    expect(sized).toMatchObject({ pieceGrams: 40, pieceLabel: "1 tranche", packageGrams: 160, unit: "portion", quantity: 1 });
    const used = toMealItem(pantryResult(sized));
    expect(used).toMatchObject({ unit: "portion", quantity: 1, portionGrams: 40, portionLabel: "1 tranche" });
    expect(Math.round(itemCalories(used))).toBe(44);
    expect(Math.round(itemCalories({ ...used, unit: "g", quantity: 20 }))).toBe(22);
  });
  it("ou directement le poids d'une pièce", () => {
    expect(withPieceSize(kept, { label: "1 pot", grams: 125 })).toMatchObject({ pieceGrams: 125, pieceLabel: "1 pot" });
  });
  it("sans poids ni paquet : rien ne change", () => {
    expect(withPieceSize(kept, { label: "tranche" })).toBe(kept);
  });
  it("se présente avec sa taille", () => {
    expect(pantryResult(withPieceSize(kept, { label: "tranche", count: 4, packageGrams: 160 })).detail).toBe("Mes ingrédients · paquet de 160 g");
  });
});

import { gramsOnly, pantryMode, withPackage } from "./pantry";

describe("mozzarella râpée en sachet de 150 g", () => {
  const mozza = toPantry({ name: "Mozzarella râpée · Pâturages", source: "off", ref: "1", kcal100: 314, protein100: 20, quantity: 100, unit: "g", portionGrams: 100, portionLabel: "1 portion (1 serving)" }, 2, "2026-10-25");
  it("au sachet : entier ou en fractions", () => {
    const sachet = withPackage(mozza, 150);
    expect(pantryMode(sachet)).toBe("package");
    const used = toMealItem(pantryResult(sachet));
    expect(used).toMatchObject({ unit: "portion", quantity: 1, portionGrams: 150, packageGrams: 150 });
    expect(Math.round(itemCalories({ ...used, quantity: 0.5 }))).toBe(236);
  });
  it("en grammes : plus de portion bizarre (1 serving)", () => {
    const grams = gramsOnly(mozza);
    expect(pantryMode(grams)).toBe("grams");
    expect(toMealItem(pantryResult(grams))).toMatchObject({ unit: "g", quantity: 100 });
    expect(grams.portionLabel).toBeUndefined();
  });
});

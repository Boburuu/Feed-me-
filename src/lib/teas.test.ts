// Thés en sachet scannés : Lipton (valeurs « thé préparé » seulement) et Renuté (fiche vide).
import { afterEach, describe, expect, it, vi } from "vitest";
import { itemCalories, openFoodFactsByBarcode, toMealItem } from "./foods";
import { drinkMl } from "./hydration";

const answer = (product: object | null) => vi.fn(async () => new Response(JSON.stringify(product ? { status: 1, product } : { status: 0 })));

afterEach(() => vi.unstubAllGlobals());

describe("thé en sachet scanné", () => {
  it("Lipton : la fiche ne donne que le thé préparé (4 kcal/100 ml)", async () => {
    vi.stubGlobal("fetch", answer({ product_name: "Thé vert fleur de jasmin pêche", brands: "Lipton", quantity: "30g", categories_tags: ["en:hot-beverages", "en:beverage-preparations"], nutriments: { "energy-kcal_prepared_100g": 4 } }));
    const tea = await openFoodFactsByBarcode("8720608003891");
    expect(tea).toMatchObject({ name: "Thé vert fleur de jasmin pêche", kcal100: 4, liquid: true, portionGrams: 250 });
    // 300 ml bus avec un sachet : 12 kcal, 300 ml dans l'hydratation.
    const cup = { ...toMealItem(tea!), unit: "g" as const, quantity: 300 };
    expect(Math.round(itemCalories(cup))).toBe(12);
    expect(drinkMl(cup)).toBe(300);
  });
  it("Renuté : fiche sans nom ni valeurs, catégorie thé → thé infusé de la table Ciqual", async () => {
    vi.stubGlobal("fetch", answer({ categories_tags: ["en:beverages", "en:hot-beverages", "en:teas"], nutriments: {} }));
    const tea = await openFoodFactsByBarcode("4792038701566");
    expect(tea).toMatchObject({ source: "off", ref: "4792038701566", liquid: true });
    expect(tea!.kcal100).toBeLessThanOrEqual(1);
    expect(tea!.detail).toMatch(/Ciqual/);
  });
  it("un produit sans valeurs qui n'est pas une boisson chaude reste introuvable", async () => {
    vi.stubGlobal("fetch", answer({ product_name: "Biscuits", categories_tags: ["en:biscuits"], nutriments: {} }));
    expect(await openFoodFactsByBarcode("123")).toBeNull();
  });
});

describe("sachet sec (valeurs du produit sec)", () => {
  const dry = { name: "Infusion saveur poire vanille", source: "off" as const, ref: "1", kcal100: 4, protein100: 0, packageGrams: 38, prepared: true, detail: "" };
  it("compté à 1 sachet (≈ 2 g), pas 100 g de sachets", () => {
    expect(toMealItem(dry)).toMatchObject({ unit: "portion", quantity: 1, portionLabel: "1 sachet", portionGrams: 2 });
  });
  it("un thé prêt à boire (en ml) ou un thé glacé ne change pas", () => {
    expect(toMealItem({ ...dry, liquid: true })).toMatchObject({ unit: "g", quantity: 100 });
    expect(toMealItem({ ...dry, name: "Ice tea pêche", prepared: undefined })).toMatchObject({ unit: "g", quantity: 100 });
  });
});

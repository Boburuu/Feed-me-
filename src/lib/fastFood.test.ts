// Fast-foods (cahier § 6) : catalogue officiel cohérent, menus sans double comptage.
import { describe, expect, it } from "vitest";
import { brands, fastFoodItems, fastFoodResult, menuTotal, searchFastFood } from "./fastFood";
import { itemCalories, normalize, toMealItem } from "./foods";

const find = (name: string) => fastFoodItems.find((item) => item.name === name)!;

describe("catalogue Burger King", () => {
  it("chaque produit a des calories cohérentes avec ses macronutriments", () => {
    for (const item of fastFoodItems) {
      const atwater = 4 * item.carbs + 4 * item.protein + 9 * item.fat;
      expect(Math.abs(atwater - item.kcal), item.name).toBeLessThanOrEqual(Math.max(25, 0.2 * item.kcal));
    }
  });

  it("aucun produit en double", () => {
    const names = fastFoodItems.map((item) => normalize(item.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("les erreurs de la carte officielle sont écartées (Perrier à 210 kcal…)", () => {
    expect(fastFoodItems.some((item) => /perrier/i.test(item.name))).toBe(false);
    for (const item of fastFoodItems.filter((entry) => /z[ée]ro|vittel/i.test(entry.name))) expect(item.kcal, item.name).toBeLessThanOrEqual(10);
  });

  it("Whopper : la portion vendue donne les valeurs officielles", () => {
    const whopper = toMealItem(fastFoodResult(find("Whopper®")));
    expect(whopper).toMatchObject({ unit: "portion", portionGrams: 278, quantity: 1, source: "enseigne" });
    expect(Math.round(itemCalories(whopper))).toBe(629);
  });

  it("une boisson se compte en ml", () => {
    const coca = toMealItem(fastFoodResult(find("Coca-Cola® (40cl)")));
    expect(coca).toMatchObject({ liquid: true, portionGrams: 400 });
    expect(Math.round(itemCalories(coca))).toBe(168);
  });
});

describe("menus et recherche", () => {
  it("un menu = la somme de ses éléments, chacun une fois", () => {
    const menu = { main: find("Whopper®"), side: find("Moyennes frites"), drink: find("Coca-Cola® (40cl)"), sauce: undefined };
    const total = menuTotal(menu);
    expect(total.items).toHaveLength(3);
    expect(total.kcal).toBe(629 + 309 + 168);
  });

  it("« whopper » trouve les Whopper, « bk frites » les frites", () => {
    expect(searchFastFood("whopper").every((item) => /whopper/i.test(item.name))).toBe(true);
    expect(searchFastFood("whopper")[0].name).toBe("Whopper®");
    expect(searchFastFood("bk frites").map((item) => item.name)).toContain("Moyennes frites");
  });

  it("les enseignes sans valeurs publiées le disent, sans rien inventer", () => {
    for (const id of ["mcdo", "kfc", "subway"]) {
      expect(brands.find((brand) => brand.id === id)?.missing).toBeTruthy();
      expect(fastFoodItems.some((item) => item.brand === id)).toBe(false);
    }
  });
});

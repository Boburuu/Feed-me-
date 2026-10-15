// Fast-foods (cahier § 6) : catalogue officiel cohérent, menus sans double comptage.
import { describe, expect, it } from "vitest";
import { brands, fastFoodItems, fastFoodResult, menuTotal, searchFastFood } from "./fastFood";
import { itemCalories, normalize, toMealItem } from "./foods";

const find = (name: string) => fastFoodItems.find((item) => item.name === name)!;

describe("catalogues Burger King et McDonald's", () => {
  it("chaque produit a des calories cohérentes avec ses macronutriments", () => {
    for (const item of fastFoodItems.filter((entry) => entry.protein !== null)) {
      const atwater = 4 * item.carbs! + 4 * item.protein! + 9 * item.fat! + 2 * (item.fiber ?? 0);
      expect(Math.abs(atwater - item.kcal), item.name).toBeLessThanOrEqual(Math.max(25, 0.2 * item.kcal));
    }
  });

  it("aucun produit en double", () => {
    const names = fastFoodItems.map((item) => `${item.brand}:${normalize(item.name)}`);
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
    for (const id of ["quick", "dominos", "pizzahut"]) {
      expect(brands.find((brand) => brand.id === id)?.missing).toBeTruthy();
      expect(fastFoodItems.some((item) => item.brand === id)).toBe(false);
    }
  });
});

describe("McDonald's et Subway (relevés officiels produit par produit)", () => {
  it("Big Mac : 530 kcal pour 232 g, comme sur mcdonalds.fr", () => {
    const bigMac = toMealItem(fastFoodResult(fastFoodItems.find((item) => item.name === "Big Mac™")!));
    expect(bigMac.portionGrams).toBe(232);
    expect(Math.round(itemCalories(bigMac))).toBe(530);
  });

  it("valeurs incohérentes de la fiche officielle écartées (Sprite passion, cheesecakes copiés)", () => {
    expect(fastFoodItems.some((item) => /Sprite® Saveur Fruit/.test(item.name))).toBe(false);
    expect(fastFoodItems.some((item) => /Cheesecake/.test(item.name))).toBe(false);
  });

  it("Subway : seules les calories sont connues, à la portion « 1 SUB 15 cm »", () => {
    const thon = toMealItem(fastFoodResult(fastFoodItems.find((item) => item.brand === "subway" && item.name === "Thon")!));
    expect(thon).toMatchObject({ unit: "portion", portionLabel: "1 SUB 15 cm", protein100: null, carbs100: null, fat100: null });
    expect(itemCalories({ ...thon, quantity: 2 })).toBe(814);
  });

  it("menu avec un produit Subway : total partiel signalé", () => {
    const thon = fastFoodItems.find((item) => item.brand === "subway" && item.name === "Thon")!;
    expect(menuTotal({ main: thon }).partial).toBe(true);
  });
});

describe("KFC (document Nutri-Score officiel)", () => {
  it("calories par produit, le reste inconnu", () => {
    const colonel = toMealItem(fastFoodResult(fastFoodItems.find((item) => item.brand === "kfc" && item.name === "Colonel Original")!));
    expect(colonel).toMatchObject({ unit: "portion", portionLabel: "1 produit", protein100: null });
    expect(itemCalories(colonel)).toBe(607);
    expect(fastFoodItems.filter((item) => item.brand === "kfc")).toHaveLength(43);
  });
});

// Tests des calculs nutritionnels : ce qui marche déjà ne doit pas changer (non-régression),
// et chaque correction du cahier des charges a son cas concret.
import { describe, expect, it } from "vitest";
import { itemCalories, itemCarbs, itemFat, itemGrams, itemProtein, offKcal, parsePackage, parsePieces, toMealItem, type FoodResult } from "./foods";
import { matchIngredient } from "./ingredientMatch";
import { ingredientsNutrition, parseIngredientLine, parseQuantity } from "./recipes";
import { parseRecipeText } from "./recipeText";
import { backfillCarbs } from "./carbsBackfill";
import { coherenceWarnings, referenceFor } from "./coherence";
import type { AppData, MealItem } from "./storage";

const food = (item: Partial<MealItem>): MealItem => ({ name: "x", source: "ciqual", quantity: 100, unit: "g", kcal100: 100, protein100: 10, ...item });

describe("calcul d'un aliment", () => {
  it("compte au gramme : quantité × valeur pour 100 g ÷ 100", () => {
    const riz = food({ quantity: 200, kcal100: 145, protein100: 2.9, carbs100: 31.8 });
    expect(itemCalories(riz)).toBeCloseTo(290);
    expect(itemProtein(riz)).toBeCloseTo(5.8);
    expect(itemCarbs(riz)).toBeCloseTo(63.6);
  });

  it("compte à la portion connue (1 banane = 120 g)", () => {
    const banane = food({ unit: "portion", quantity: 2, portionGrams: 120, kcal100: 91 });
    expect(itemGrams(banane)).toBe(240);
    expect(itemCalories(banane)).toBeCloseTo(218.4);
  });

  it("une part de recette garde ses valeurs par part", () => {
    const part = food({ source: "recette", unit: "portion", quantity: 1.5, kcal100: 339, protein100: 36, portionGrams: undefined });
    expect(itemCalories(part)).toBeCloseTo(508.5);
  });

  it("une boisson en ml : Monster Pipeline Punch, 125 ml à 36 kcal/100 ml = 45 kcal", () => {
    const monster = food({ liquid: true, unit: "portion", quantity: 0.25, portionGrams: 500, kcal100: 36 });
    expect(itemGrams(monster)).toBe(125);
    expect(itemCalories(monster)).toBeCloseTo(45);
  });

  it("glucides inconnus : null, pas zéro", () => {
    expect(itemCarbs(food({ carbs100: undefined }))).toBeNull();
  });
});

describe("contenances et pièces des emballages", () => {
  it("lit les contenances", () => {
    expect(parsePackage("150g")).toBe(150);
    expect(parsePackage("0,85 L")).toBe(850);
    expect(parsePackage("33 cl")).toBe(330);
    expect(parsePackage("4 x 125 g")).toBe(125);
  });

  it("déduit le poids d'une pièce (4 tranches – 160 g = 40 g)", () => {
    expect(parsePieces("4 tranches - 160 g Jambon", 160)).toEqual({ pieceGrams: 40, pieceLabel: "1 tranche" });
    expect(parsePieces("6 pots de 125 g", 125)).toBeUndefined();
  });

  it("ajoute un produit à sa portion, sinon à 100 g", () => {
    const sans: FoodResult = { name: "Farine", source: "ciqual", kcal100: 350, protein100: 10, detail: "" };
    expect(toMealItem(sans)).toMatchObject({ unit: "g", quantity: 100 });
    expect(toMealItem({ ...sans, portionGrams: 30, portionLabel: "1 portion" })).toMatchObject({ unit: "portion", quantity: 1 });
  });
});

describe("lecture des recettes", () => {
  it("lit quantités, fractions et unités", () => {
    expect(parseQuantity("1/4")).toBe(0.25);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseIngredientLine("1 c.c. de ketchup")).toMatchObject({ quantity: 1, unit: "c. à café", name: "ketchup" });
    expect(parseIngredientLine("1 L d’eau")).toMatchObject({ quantity: 1, unit: "L" });
  });

  it("lit les valeurs écrites dans la recette", () => {
    const burger = parseRecipeText("BURGER\n1 portion – 339 kcal – 36 g P – 19 g G – 14 g L\nIngrédients\n2 feuilles de riz");
    expect(burger).toMatchObject({ calories: 339, protein: 36, carbs: 19, portions: 1 });
    const bombe = parseRecipeText("Bombe de jambon\nMACRO (pour 1) 393kcal · 29P · 52G · 9L\nINGRÉDIENTS (pour 4)\n200 g de skyr");
    expect(bombe).toMatchObject({ calories: 393, protein: 29, carbs: 52, portions: 4 });
  });
});

describe("ingrédients écrits retrouvés dans les bases", () => {
  const total = async (lines: string[]) => {
    const items = await Promise.all(lines.map(async (line) => {
      const item = parseIngredientLine(line);
      const matched = await matchIngredient(item);
      return matched ? { ...item, food: matched } : item;
    }));
    return ingredientsNutrition(items);
  };

  it("burger en feuille de riz : environ 430 kcal", async () => {
    const { kcal } = await total(["2 feuilles de riz J.B (22 cm)", "1 œuf plein air Lidl", "100 g de viande bovine hachée 5 %", "1 tranche de cheddar", "2 tranches de filet de bacon fumé", "1 c.c. de ketchup"]);
    expect(kcal).toBeGreaterThan(350);
    expect(kcal).toBeLessThan(450);
  });

  it("« crevettes ou poulet ou tofu » compte les crevettes, pas 12 blancs de poulet", async () => {
    const [crevettes] = await Promise.all([matchIngredient(parseIngredientLine("12 crevettes ou poulet ou tofu"))]);
    expect(crevettes?.matchedName).toBe("Crevettes");
    expect(itemGrams(crevettes!)).toBe(180);
  });

  it("dans une recette, 120 g de quinoa est compté cru", async () => {
    const quinoa = await matchIngredient(parseIngredientLine("120 g de quinoa"));
    expect(quinoa?.matchedName).toMatch(/cru/);
  });
});

describe("cru, sec et cuit (cahier § 2.4)", () => {
  // Riz basmati scanné : fiche du riz sec, 352 kcal/100 g.
  const riz = (weighedCooked?: boolean) => ({ ...toMealItem({ name: "Riz basmati", source: "off", kcal100: 352, protein100: 8, carbs100: 77, fat100: 1, detail: "" }), quantity: 102, unit: "g" as const, weighedCooked });

  it("reconnaît un féculent vendu sec", () => {
    expect(riz().cookedFactor).toBeCloseTo(3.01, 1);
    expect(toMealItem({ name: "Riz blanc, cuit, non salé", source: "ciqual", kcal100: 145, protein100: 3, detail: "" }).cookedFactor).toBeUndefined();
    expect(toMealItem({ name: "Galette de riz soufflé", source: "ciqual", kcal100: 385, protein100: 8, detail: "" }).cookedFactor).toBeUndefined();
  });

  it("102 g de riz basmati pesé cuit ≈ 120 kcal, pas 359", () => {
    expect(itemCalories(riz(true))).toBeGreaterThan(110);
    expect(itemCalories(riz(true))).toBeLessThan(130);
  });

  it("pesé sec : la fiche s'applique telle quelle (359 kcal)", () => {
    expect(itemCalories(riz(false))).toBeCloseTo(359, 0);
  });

  it("une portion d'emballage reste une portion de produit sec", () => {
    const portion = { ...riz(true), unit: "portion" as const, quantity: 1, portionGrams: 75 };
    expect(itemCalories(portion)).toBeCloseTo(264, 0);
  });
});

describe("nutriments (cahier § 2.6)", () => {
  it("compte les lipides, et null quand ils sont inconnus", () => {
    expect(itemFat(food({ quantity: 150, fat100: 13 }))).toBeCloseTo(19.5);
    expect(itemFat(food({ fat100: undefined }))).toBeNull();
  });

  it("calcule les kcal depuis les kJ quand l'étiquette ne donne que les kJ", () => {
    expect(offKcal({ "energy-kj_100g": 521 })).toBe(125);
    expect(offKcal({ "energy-kcal_100g": 124, "energy-kj_100g": 521 })).toBe(124);
    expect(offKcal({})).toBeNull();
  });
});

describe("valeurs incohérentes (cahier § 2.5)", () => {
  it("pavés de saumon à 269 kcal/100 g : signalés face au saumon de la table Ciqual", async () => {
    const saumon = food({ name: "Pavés de saumon à l'aneth · Marque", source: "off", ref: "123", kcal100: 269, protein100: 20, carbs100: 1.5, fat100: 20 });
    const reference = await referenceFor(saumon);
    expect(reference?.refName).toMatch(/saumon/i);
    expect(coherenceWarnings({ ...saumon, ...reference }).join(" ")).toMatch(/Inhabituel/);
  });

  it("une fiche dont les kcal ne collent pas aux macros est signalée", () => {
    expect(coherenceWarnings(food({ source: "off", kcal100: 400, protein100: 10, carbs100: 10, fat100: 2 }))[0]).toMatch(/incohérente/);
  });

  it("une fiche normale ne déclenche rien (poulet rôti : 124 kcal, 6,1 P, 14 G, 4,5 L)", () => {
    expect(coherenceWarnings(food({ source: "off", kcal100: 124, protein100: 6.1, carbs100: 14, fat100: 4.5 }))).toEqual([]);
  });

  it("le riz sec n'est pas comparé au riz cuit", async () => {
    expect(await referenceFor({ ...toMealItem({ name: "Riz basmati", source: "off", ref: "1", kcal100: 352, protein100: 8, detail: "" }) })).toBeNull();
  });
});

describe("recettes : lipides et valeurs écrites", () => {
  it("lit « 14 g L » et « 9L »", () => {
    expect(parseRecipeText("BURGER\n1 portion – 339 kcal – 36 g P – 19 g G – 14 g L\nIngrédients\n2 œufs").fat).toBe(14);
    expect(parseRecipeText("Bombe\nMACRO (pour 1) 393kcal · 29P · 52G · 9L\nIngrédients\n200 g de skyr").fat).toBe(9);
  });

  it("additionne les lipides des ingrédients", () => {
    const totals = ingredientsNutrition([
      { name: "a", quantity: 100, unit: "g", food: food({ quantity: 100, fat100: 10 }) },
      { name: "b", quantity: 50, unit: "g", food: food({ quantity: 50, fat100: 20 }) },
    ]);
    expect(totals.fat).toBeCloseTo(20);
  });
});

describe("repas anciens complétés (non-régression des historiques)", () => {
  it("ajoute glucides et lipides sans toucher aux calories", async () => {
    const data = {
      recipes: [], customFoods: [],
      meals: [{ id: 1, date: "2026-10-01", category: "dejeuner", name: "Riz", calories: 290, source: "manual",
        items: [{ name: "Riz", source: "ciqual", ref: "9104", quantity: 200, unit: "g", kcal100: 145, protein100: 2.9 }] }],
    } as unknown as AppData;
    const apply = await backfillCarbs(data);
    const meal = apply!(data).meals[0];
    expect(meal.calories).toBe(290);
    expect(meal.carbs).toBe(64);
    expect(meal.fat).toBe(1);
  });
});

describe("pas de fausse alerte", () => {
  it("un plat composé n'est pas comparé à un seul aliment", async () => {
    const plat = food({ name: "St Jacques fondue de poireaux & Riz Basmati · Marie", source: "off", ref: "1", kcal100: 144 });
    expect(await referenceFor(plat)).toBeNull();
  });
});

// Retours du 17 octobre : coin des conseils, recette comptée en morceaux ou en grammes.
import { describe, expect, it } from "vitest";
import { dailyTip, recentTips } from "./tips";
import { itemCalories, itemGrams, needsPortionWeight, recipeResult, toMealItem, withPortionWeight } from "./foods";
import { checkPayload, mealPayload } from "./share";
import type { Meal, MealItem, Recipe } from "./storage";

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

import { packageQuery, rankByPackage } from "./packageText";

describe("produit reconnu par le devant du paquet", () => {
  // Lignes lues sur le paquet de fromage Milbona (hauteur du texte en pixels).
  const lines = [
    { text: "Milbona", height: 60 },
    { text: "PRÉPARATION DE", height: 40 },
    { text: "FROMAGE FONDU POUR", height: 40 },
    { text: "Hamburger", height: 110 },
    { text: "10 TRANCHES", height: 45 },
    { text: "NUTRI-SCORE", height: 12 },
    { text: "Suggestion de présentation", height: 14 },
    { text: "200 g", height: 50 },
  ];
  it("garde la marque et le nom, pas les mentions ni les quantités", () => {
    expect(packageQuery(lines)).toBe("hamburger milbona preparation fromage fondu");
  });
  it("classe les produits selon les mots lus (pas les pains à burger)", () => {
    const found = [
      { name: "Pains pour hamburger", brand: "U" },
      { name: "Milbona fromage fondu", brand: "Milbona" },
      { name: "Fromage fondu pour Hamburger", brand: "Milbona" },
      { name: "Fromage fondu hamburger", brand: "Casino" },
    ];
    expect(rankByPackage(found, lines).map((item) => `${item.name} · ${item.brand}`)).toEqual([
      "Fromage fondu pour Hamburger · Milbona",
      "Milbona fromage fondu · Milbona",
      "Fromage fondu hamburger · Casino",
    ]);
  });
});

import { lastTips, tipAt, tips } from "./tips";

describe("un nouveau conseil chaque jour", () => {
  it("passe par tous les conseils avant de revoir le premier", () => {
    const seen = new Set(Array.from({ length: tips.length }, (_, count) => tipAt(count).id));
    expect(seen.size).toBe(tips.length);
    expect(tipAt(1).id).not.toBe(tipAt(2).id);
  });
  it("liste les derniers vus, le plus récent d'abord", () => {
    expect(lastTips(5, 3)).toEqual([tipAt(5), tipAt(4), tipAt(3)]);
  });
});

describe("recette comptée en g ou ml sans poids pesé (chocolat au lait)", () => {
  const ing = (name: string, kcal100: number, grams: number) => ({ name, quantity: grams, unit: "g", food: { name, source: "off" as const, kcal100, protein100: 3, quantity: grams, unit: "g" as const } });
  const chocolat: Recipe = { id: 9, name: "Chocolat au lait", ingredients: [{ title: "", items: [ing("Goody cao", 392, 7), ing("Lait demi-écrémé", 46, 272)] }], steps: [], time: 5, portions: 1, calories: 153, protein: 8 };
  const line = toMealItem(recipeResult(chocolat));
  it("estime le poids d'après les ingrédients (7 g + 272 g)", () => {
    expect(line).toMatchObject({ recipeGrams: 279, recipeGramsEstimated: true });
  });
  it("150 ml au lieu de la tasse entière : 82 kcal", () => {
    expect(Math.round(itemCalories({ ...line, quantity: 150 / 279, recipeCount: "grams" }))).toBe(82);
  });
  it("un poids pesé l'emporte sur l'estimation", () => {
    expect(toMealItem(recipeResult({ ...chocolat, totalGrams: 260 }))).toMatchObject({ recipeGrams: 260 });
    expect(toMealItem(recipeResult({ ...chocolat, totalGrams: 260 })).recipeGramsEstimated).toBeUndefined();
  });
  it("pas d'estimation si un ingrédient n'a pas de fiche", () => {
    const partiel = { ...chocolat, ingredients: [{ title: "", items: [...chocolat.ingredients[0].items, { name: "Cannelle", quantity: 1, unit: "pincée" }] }] };
    expect(toMealItem(recipeResult(partiel)).recipeGrams).toBeUndefined();
  });
});

import { cleanMealName, eatenItems, recipeFromMeal } from "./sharedMeal";

describe("repas reçu : comme repas, assiette ou recette", () => {
  // Repas du copain : sa recette « Penne poulet » (900 g pour 2 parts), 200 g mangés.
  const penne: MealItem = { name: "Penne Poulet légumes du soleil IQF 900g · Monique ranou", source: "recette", ref: "77", quantity: 200 / 450, unit: "portion", kcal100: 481.5, protein100: 20, recipePortions: 2, recipeGrams: 900, recipeCount: "grams" };
  const received = { name: "Penne Poulet légumes du soleil IQF 900g · Monique ranou (200 g sur 900 g)", category: "diner" as const, items: [penne] };
  it("nettoie le nom", () => {
    expect(cleanMealName(received.name)).toBe("Penne Poulet légumes du soleil IQF 900g · Monique ranou");
  });
  it("en recette : la recette entière, 2 parts, 900 g", () => {
    const recipe = recipeFromMeal(received, 1);
    expect(recipe).toMatchObject({ portions: 2, totalGrams: 900, calories: 482 });
  });
  it("assiette partagée ouverte en repas : la part mangée", () => {
    const plate = { name: "Assiette maison : riz, poulet", category: "dejeuner" as const, plate: { servings: 4, share: 0.25 }, items: [{ ...pain(400), name: "Riz" }] };
    expect(eatenItems(plate)[0].quantity).toBe(100);
    expect(recipeFromMeal(plate, 2)).toMatchObject({ name: "riz, poulet", portions: 4 });
  });
});
function pain(grams: number): MealItem { return { name: "Pain", source: "ciqual", kcal100: 250, protein100: 8, quantity: grams, unit: "g" }; }

import { isRawEggProduct } from "./foods";
import { packShare, unpackShare } from "./sharePack";
import { checkPayload as checkShared, recipePayload as sharedRecipe } from "./share";

describe("œufs comptés à l'œuf", () => {
  it("reconnaît une boîte d'œufs, pas les pâtes aux œufs ni le bœuf", () => {
    expect(isRawEggProduct("20 oeufs frais de poules élevées au sol")).toBe(true);
    expect(isRawEggProduct("Œufs bio plein air")).toBe(true);
    expect(isRawEggProduct("Pâtes aux œufs frais")).toBe(false);
    expect(isRawEggProduct("Bœuf haché 5 %")).toBe(false);
  });
  it("1 œuf ≈ 55 g par défaut", () => {
    const egg = toMealItem({ name: "20 oeufs frais de poules élevées au sol", source: "off", ref: "1", kcal100: 140, protein100: 12.5, detail: "" });
    expect(egg).toMatchObject({ unit: "portion", quantity: 1, portionGrams: 55, portionLabel: "1 œuf" });
    expect(Math.round(itemCalories({ ...egg, quantity: 2 }))).toBe(154);
  });
});

describe("liens de partage courts", () => {
  const recipe: Recipe = { id: 3, name: "Omelette", steps: [{ title: "", steps: [{ title: "", text: "Battre." }] }], time: 10, portions: 1, calories: 160, protein: 13,
    ingredients: [{ title: "", items: [
      { name: "Œuf", quantity: 2, unit: "", food: { name: "Œuf", source: "ciqual", ref: "22000", kcal100: 140, protein100: 12.5, carbs100: null, unit: "portion", quantity: 2, portionGrams: 55, portionLabel: "1 œuf", servingGrams: 55, servingLabel: "1 œuf" } },
      { name: "Sel, poivre", quantity: null, unit: "" },
    ] }] };
  it("relit exactement le partage compacté", () => {
    const payload = sharedRecipe(recipe);
    const back = checkShared(unpackShare(JSON.parse(JSON.stringify(packShare(payload as never)))));
    expect({ ...back, sharedAt: "" }).toEqual({ ...checkShared(JSON.parse(JSON.stringify(payload))), sharedAt: "" });
  });
  it("est plus court que l'ancien format", () => {
    const payload = sharedRecipe(recipe);
    expect(JSON.stringify(packShare(payload as never)).length).toBeLessThan(JSON.stringify(payload).length * 0.7);
  });
  it("les anciens liens restent lisibles", () => {
    const payload = JSON.parse(JSON.stringify(sharedRecipe(recipe)));
    expect(unpackShare(payload)).toBe(payload);
  });
});

import { storeBrand } from "./foods";

describe("produits de la marque U", () => {
  it("reconnaît U, Super U, Système U", () => {
    expect(storeBrand("lardons U")).toEqual({ brand: "u", rest: "lardons" });
    expect(storeBrand("pain de mie Super U")).toEqual({ brand: "u", rest: "pain de mie" });
    expect(storeBrand("Système U yaourt nature")).toEqual({ brand: "u", rest: "yaourt nature" });
  });
  it("ne touche pas aux autres recherches", () => {
    expect(storeBrand("pain de mie")).toBeNull();
    expect(storeBrand("ultra rosa")).toBeNull();
    expect(storeBrand("U")).toBeNull();
  });
});

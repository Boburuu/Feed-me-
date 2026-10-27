// Planification et liste de courses (cahier § 8, critères « Planning » et « Liste de courses »).
import { describe, expect, it } from "vitest";
import { hydrationOf } from "./hydration";
import { confirmEaten, copyDay, dayTotals, eatenMeals, formatAmounts, shoppingList, weekDays, weekStart } from "./planning";
import type { Meal, Recipe } from "./storage";

const meal = (id: number, date: string, calories: number, extra: Partial<Meal> = {}): Meal => ({ id, date, category: "dejeuner", name: `Repas ${id}`, calories, source: "manual", ...extra });

describe("prévu et mangé", () => {
  const meals = [meal(1, "2026-10-14", 600), meal(2, "2026-10-14", 400, { status: "planned" }), meal(3, "2026-10-15", 700, { status: "planned" })];

  it("un repas prévu demain n'est pas compté aujourd'hui, ni comme mangé", () => {
    expect(dayTotals(meals, "2026-10-14")).toMatchObject({ eatenKcal: 600, plannedKcal: 400 });
    expect(dayTotals(meals, "2026-10-15")).toMatchObject({ eatenKcal: 0, plannedKcal: 700 });
    expect(eatenMeals(meals).map((item) => item.id)).toEqual([1]);
  });

  it("une boisson prévue n'entre pas dans l'hydratation avant d'être bue", () => {
    const canette = { name: "Monster", source: "off" as const, quantity: 1, unit: "portion" as const, portionGrams: 500, liquid: true, kcal100: 3, protein100: 0 };
    const prevue = meal(4, "2026-10-14", 14, { status: "planned", drinksCounted: true, items: [canette] });
    expect(hydrationOf({ water: {}, meals: [prevue] }, "2026-10-14").totalMl).toBe(0);
    expect(hydrationOf({ water: {}, meals: [{ ...prevue, status: undefined }] }, "2026-10-14").mealsMl).toBe(500);
  });

  it("semaine du lundi au dimanche", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekDays("2026-10-12")).toHaveLength(7);
  });

  it("copier une journée crée des repas prévus, sans toucher l'original", () => {
    const copies = copyDay(meals, "2026-10-14", "2026-10-20", 100);
    expect(copies.map((item) => [item.id, item.date, item.status])).toEqual([[100, "2026-10-20", "planned"], [101, "2026-10-20", "planned"]]);
    expect(meals[0].status).toBeUndefined();
  });
});

describe("liste de courses", () => {
  const crepes: Recipe = {
    id: 9, name: "Crêpes", portions: 4, time: 20, calories: 200, protein: 6, steps: [],
    ingredients: [{ title: "", items: [{ name: "farine", quantity: 250, unit: "g" }, { name: "œufs", quantity: 4, unit: "" }, { name: "lait", quantity: 0.5, unit: "L" }, { name: "sel", quantity: null, unit: "" }] }],
  };
  const prevus: Meal[] = [
    meal(1, "2026-10-15", 400, { status: "planned", name: "Crêpes", items: [{ name: "Crêpes", source: "recette", ref: "9", quantity: 2, unit: "portion", kcal100: 200, protein100: 6, recipePortions: 4 }] }),
    meal(2, "2026-10-16", 300, { status: "planned", items: [
      { name: "Farine · Francine", source: "off", quantity: 100, unit: "g", kcal100: 350, protein100: 10 },
      { name: "Jambon blanc", source: "ciqual", quantity: 3, unit: "portion", portionGrams: 45, portionLabel: "1 tranche", kcal100: 125, protein100: 20 },
      { name: "Lait", source: "ciqual", quantity: 1, unit: "portion", portionGrams: 200, portionLabel: "1 verre", liquid: true, kcal100: 46, protein100: 3 },
    ] }),
    meal(3, "2026-10-14", 500, { items: [{ name: "Farine", source: "ciqual", quantity: 999, unit: "g", kcal100: 350, protein100: 10 }] }),
  ];
  const list = shoppingList(prevus, [crepes], "2026-10-14", "2026-10-20");
  const line = (key: string) => list.find((item) => item.key === key);

  it("remplace une recette par ses ingrédients, au prorata des parts (2 parts sur 4)", () => {
    expect(formatAmounts(line("oeuf")!.amounts)).toBe("2");
  });

  it("regroupe les ingrédients identiques et additionne les unités compatibles", () => {
    expect(formatAmounts(line("farine")!.amounts)).toBe("225 g"); // 125 g (recette) + 100 g (paquet)
    expect(formatAmounts(line("lait")!.amounts)).toBe("450 ml"); // 0,25 L + 1 verre de 200 ml
  });

  it("ne mélange pas deux produits différents (lait / lait de coco)", () => {
    const coco = shoppingList([meal(5, "2026-10-15", 0, { status: "planned", items: [{ name: "Lait de coco", source: "ciqual", quantity: 200, unit: "g", kcal100: 180, protein100: 2 }] })], [], "2026-10-14", "2026-10-20");
    expect(coco.map((item) => item.key)).toEqual(["lait de coco"]);
  });

  it("ne convertit pas des tranches en grammes", () => {
    expect(formatAmounts(line("jambon blanc")!.amounts)).toBe("3 tranches");
  });

  it("garde les ingrédients sans quantité, et ignore les repas déjà mangés", () => {
    expect(line("sel")!.amounts).toEqual([]);
    expect(list.flatMap((item) => item.amounts).some((amount) => amount.quantity === 999)).toBe(false);
  });
});

describe("repas préparé à l'avance, mangé un autre jour", () => {
  const meals = [meal(1, "2026-10-20", 500, { status: "planned" }), meal(2, "2026-10-20", 300)];
  it("prévu lundi, mangé mercredi : il compte mercredi, plus lundi", () => {
    const after = confirmEaten(meals, 1, "2026-10-22");
    expect(dayTotals(after, "2026-10-20")).toMatchObject({ plannedKcal: 0, eatenKcal: 300 });
    expect(dayTotals(after, "2026-10-22")).toMatchObject({ plannedKcal: 0, eatenKcal: 500 });
  });
  it("validé le jour prévu : il reste ce jour-là, et les autres repas ne bougent pas", () => {
    const after = confirmEaten(meals, 1, "2026-10-20");
    expect(dayTotals(after, "2026-10-20").eatenKcal).toBe(800);
    expect(after[1]).toBe(meals[1]);
  });
});

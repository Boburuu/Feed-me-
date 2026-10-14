// Correction locale d'une fiche (cahier § 11) : elle prime à l'ajout, et l'historique ne
// change que sur demande.
import { describe, expect, it } from "vitest";
import { applyCorrection, canCheckLabel, correctPastMeals, correctionKey, mealsWithProduct, reliabilityOf, type ProductCorrection } from "./corrections";
import { itemCalories } from "./foods";
import type { AppData, Meal, MealItem } from "./storage";

const poulet: MealItem = { name: "Poulet rôti · Marque", source: "off", ref: "3250390000001", quantity: 225, unit: "g", kcal100: 131, protein100: 6, carbs100: 15, fat100: 5, refKcal100: 200, refName: "Poulet" };
const correction: ProductCorrection = {
  name: poulet.name, kcal100: 124, protein100: 6.1, carbs100: 14, fat100: 4.5,
  original: { kcal100: 131, protein100: 6, carbs100: 15, fat100: 5 }, date: "2026-10-14",
};
const key = correctionKey(poulet);
const meal = (id: number, items: MealItem[]): Meal => ({ id, date: "2026-10-10", category: "Déjeuner" as Meal["category"], name: "Repas", calories: Math.round(items.reduce((sum, item) => sum + itemCalories(item), 0)), source: "manual", items });

describe("correction locale", () => {
  it("une fiche est désignée par sa base et son code", () => {
    expect(key).toBe("off:3250390000001");
    expect(correctionKey({ name: "Œuf dur", source: "perso" })).toBe("nom:oeuf dur");
  });

  it("prime sur la fiche à l'ajout, sans l'alerte « inhabituel »", () => {
    const item = applyCorrection(poulet, { [key]: correction });
    expect(item).toMatchObject({ kcal100: 124, carbs100: 14, fat100: 4.5, corrected: true });
    expect(item.refKcal100).toBeUndefined();
    expect(Math.round(itemCalories(item))).toBe(279);
    expect(applyCorrection(poulet, {})).toBe(poulet);
  });

  it("les repas passés ne changent que sur demande, et les autres jamais", () => {
    const autre: MealItem = { ...poulet, ref: "999", name: "Autre" };
    const data = { meals: [meal(1, [poulet]), meal(2, [autre])] } as unknown as AppData;
    expect(mealsWithProduct(data.meals, key, correction).map((entry) => entry.id)).toEqual([1]);
    const next = correctPastMeals(data, key, correction);
    expect(next.meals[0].calories).toBe(279);
    expect(next.meals[0].items![0].corrected).toBe(true);
    expect(next.meals[1]).toBe(data.meals[1]);
    expect(data.meals[0].calories).toBe(295);
  });

  it("assiette partagée : la part mangée reste la même", () => {
    const plate = { ...meal(3, [poulet]), plate: { servings: 2, share: 0.5 } };
    const next = correctPastMeals({ meals: [plate] } as unknown as AppData, key, correction);
    expect(next.meals[0].calories).toBe(140);
  });
});

describe("fiabilité et vérification", () => {
  it("badge selon la source", () => {
    expect(reliabilityOf(poulet).tone).toBe("community");
    expect(reliabilityOf({ ...poulet, source: "ciqual" }).tone).toBe("sure");
    expect(reliabilityOf({ ...poulet, source: "perso" }).label).toBe("saisi à la main");
    expect(reliabilityOf({ ...poulet, corrected: true }).label).toBe("corrigé avec l'étiquette");
  });

  it("pas de vérification pour une recette ou une valeur par portion seule", () => {
    expect(canCheckLabel(poulet)).toBe(true);
    expect(canCheckLabel({ ...poulet, source: "recette" })).toBe(false);
    expect(canCheckLabel({ ...poulet, unit: "portion", quantity: 1 })).toBe(false);
    expect(canCheckLabel({ ...poulet, unit: "portion", quantity: 1, portionGrams: 225 })).toBe(true);
  });
});

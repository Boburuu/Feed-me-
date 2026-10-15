// Partage (cahier § 7) : lien autonome, fichier JSON, données vérifiées, pas de doublon.
import { describe, expect, it } from "vitest";
import { checkPayload, freeName, mealPayload, readShare, recipeConflict, recipePayload, shareLink, ShareError, type SharePayload } from "./share";
import type { Meal, Recipe } from "./storage";

const riz = { name: "Riz basmati", source: "ciqual" as const, ref: "9100", quantity: 200, unit: "g" as const, kcal100: 350, protein100: 8, carbs100: 78, fat100: 1, cookedFactor: 3.01, weighedCooked: true };
const sauce = { name: "Ma sauce", source: "perso" as const, ref: "17", quantity: 50, unit: "g" as const, kcal100: 120, protein100: 1, corrected: true };
const recette: Recipe = {
  id: 42, name: "Tom Yum", portions: 4, time: 30, calories: 210, protein: 18, carbs: 12, fat: 9, category: "plat", images: ["img-1"],
  ingredients: [{ title: "", items: [{ name: "riz", quantity: 200, unit: "g", food: riz }, { name: "sauce", quantity: 50, unit: "g", food: sauce }] }],
  steps: [{ title: "", steps: [{ title: "", text: "Cuire le riz." }] }],
  url: "https://example.com/tom-yum",
};
const repas: Meal = { id: 7, date: "2026-10-14", category: "diner", name: "Assiette", calories: 400, source: "manual", items: [riz, sauce], plate: { servings: 4, share: 0.25 } };

describe("lien autonome", () => {
  it("une recette fait l'aller-retour par le lien, sans id ni photos", async () => {
    const link = await shareLink(recipePayload(recette));
    expect(link.startsWith("https://boburuu.github.io/Feed-me-/#partage=")).toBe(true);
    const back = await readShare(`Regarde ma recette : ${link} bon appétit`);
    expect(back.kind).toBe("recette");
    if (back.kind !== "recette") return;
    expect(back.recipe).not.toHaveProperty("id");
    expect(back.recipe).not.toHaveProperty("images");
    expect(back.recipe).toMatchObject({ name: "Tom Yum", portions: 4, calories: 210, url: "https://example.com/tom-yum" });
    // Riz : code Ciqual gardé ; aliment perso : sa référence ne vaut que chez l'expéditeur.
    const [first, second] = back.recipe.ingredients[0].items;
    expect(first.food).toMatchObject({ ref: "9100", cookedFactor: 3.01, weighedCooked: true });
    expect(second.food?.ref).toBeUndefined();
    expect(second.food).not.toHaveProperty("corrected");
  });

  it("une assiette garde sa part mangée", async () => {
    const back = await readShare(await shareLink(mealPayload(repas)));
    expect(back.kind === "repas" && back.meal).toMatchObject({ category: "diner", plate: { servings: 4, share: 0.25 } });
    expect(back.kind === "repas" && back.meal.items).toHaveLength(2);
  });

  it("le fichier JSON se relit aussi", async () => {
    const back = await readShare(JSON.stringify(recipePayload(recette)));
    expect(back.kind).toBe("recette");
  });

  it("un lien tronqué ou étranger est refusé avec un message clair", async () => {
    const link = await shareLink(recipePayload(recette));
    await expect(readShare(link.slice(0, link.length - 25))).rejects.toBeInstanceOf(ShareError);
    await expect(readShare("https://example.com")).rejects.toThrow(/incomplet/);
    await expect(readShare('{"hello": 1}')).rejects.toThrow(/pas un partage Feed Me/);
  });
});

describe("données vérifiées", () => {
  const base = recipePayload(recette) as SharePayload & { kind: "recette" };
  const hostile = (patch: Record<string, unknown>) => ({ ...base, recipe: { ...base.recipe, ...patch } });

  it("un lien « javascript: » et les champs inconnus sont retirés", () => {
    const payload = checkPayload({ ...hostile({ url: "javascript:alert(1)", admin: true }) }) as SharePayload & { kind: "recette" };
    expect(payload.recipe.url).toBeUndefined();
    expect(payload.recipe).not.toHaveProperty("admin");
  });

  it("des valeurs absurdes ne passent pas", () => {
    const payload = checkPayload(hostile({ calories: -50, portions: 1e9 })) as SharePayload & { kind: "recette" };
    expect(payload.recipe.calories).toBe(0);
    expect(payload.recipe.portions).toBe(1);
  });

  it("un repas sans aliment valide est refusé", () => {
    expect(() => checkPayload({ ...mealPayload(repas), meal: { name: "x", items: [{ name: "?", kcal100: "beaucoup" }] } })).toThrow(/aucun aliment/);
  });
});

describe("doublons", () => {
  it("la même recette déjà dans le carnet est reconnue", () => {
    const shared = recipePayload(recette) as SharePayload & { kind: "recette" };
    expect(recipeConflict([recette], shared.recipe)?.kind).toBe("same");
    expect(recipeConflict([{ ...recette, steps: [] }], shared.recipe)?.kind).toBe("name");
    expect(recipeConflict([], shared.recipe)).toBeNull();
  });

  it("une copie reçoit un nom libre", () => {
    expect(freeName([recette, { ...recette, name: "Tom Yum (2)" }], "Tom Yum")).toBe("Tom Yum (3)");
  });
});

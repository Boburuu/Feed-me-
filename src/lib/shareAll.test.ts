// Tout partager : repas prévus, liste de courses, carnet, avec « de qui / pour qui » (Ma tablée).
import { describe, expect, it } from "vitest";
import { ackPayload, carnetPayload, mealPayload, readShare, shareLink, shoppingPayload, weekPayload, withMeta } from "./share";
import { addNames, companionsFor, joinNames } from "./tablee";
import { shareMessage } from "../components/ShareSheet";
import type { Meal, Recipe } from "./storage";

const lasagnes: Meal = {
  id: 7, date: "2026-11-02", category: "diner", name: "Lasagnes maison", calories: 412, protein: 24, carbs: 40, fat: 15, source: "manual", status: "planned",
  items: [{ name: "Lasagnes maison", source: "recette", ref: "12", quantity: 1, unit: "portion", kcal100: 412, protein100: 24, portionLabel: "1 part" }],
  plate: { servings: 4, share: 0.25 }, with: ["Alex"],
};
const sandwich: Meal = { id: 8, date: "2026-11-05", category: "dejeuner", name: "Sandwich jambon", calories: 380, source: "manual", status: "planned" };
const recipe: Recipe = {
  id: 12, name: "Frittata aux légumes", portions: 2, time: 20, calories: 266, protein: 18,
  ingredients: [{ title: "", items: [{ name: "œufs", quantity: 4, unit: "", food: undefined }] }],
  steps: [{ title: "", steps: [{ title: "", text: "Battre les œufs." }] }],
  images: ["photo-1"],
} as Recipe;

describe("partage des repas prévus", () => {
  it("le lien redonne les repas, leur jour, et qui les envoie", async () => {
    const payload = withMeta(weekPayload([lasagnes, sandwich]), { from: "Camille", guests: ["Alex", "Sam"], id: "abc123" });
    const received = await readShare(await shareLink(payload));
    expect(received.kind).toBe("semaine");
    if (received.kind !== "semaine") return;
    expect(received.meals).toHaveLength(2);
    expect(received.meals[0]).toMatchObject({ name: "Lasagnes maison", date: "2026-11-02", category: "diner", calories: 412, plate: { servings: 4, share: 0.25 } });
    // Repas sans détail des aliments : il passe quand même, avec ses calories.
    expect(received.meals[1]).toMatchObject({ name: "Sandwich jambon", calories: 380 });
    expect(received.meals[1].items).toBeUndefined();
    // Ni l'état « prévu » ni « Mangé avec » de l'expéditeur : c'est le téléphone qui reçoit qui décide.
    expect(received.meals[0]).not.toHaveProperty("status");
    expect(received.meals[0]).not.toHaveProperty("with");
    expect(received).toMatchObject({ from: "Camille", guests: ["Alex", "Sam"], id: "abc123" });
  });
});

describe("partage de la liste de courses", () => {
  it("garde les articles et leurs quantités", async () => {
    const received = await readShare(await shareLink(shoppingPayload([{ name: "Bœuf haché 5 %", qty: "400 g" }, { name: "Éponges", qty: "" }])));
    expect(received.kind).toBe("courses");
    if (received.kind !== "courses") return;
    expect(received.lines).toEqual([{ name: "Bœuf haché 5 %", qty: "400 g" }, { name: "Éponges", qty: "" }]);
  });
});

describe("partage du carnet", () => {
  it("recettes sans photos ni identifiant, ingrédients sans rang de liste", async () => {
    const product = { name: "Skyr nature", source: "off" as const, ref: "123", quantity: 140, unit: "g" as const, kcal100: 60, protein100: 11, pantryId: 3, addedAt: "2026-10-01" };
    const received = await readShare(await shareLink(carnetPayload([recipe], [product])));
    expect(received.kind).toBe("carnet");
    if (received.kind !== "carnet") return;
    expect(received.recipes[0]).toMatchObject({ name: "Frittata aux légumes", portions: 2, calories: 266 });
    expect(received.recipes[0]).not.toHaveProperty("images");
    expect(received.recipes[0]).not.toHaveProperty("id");
    expect(received.products[0]).toMatchObject({ name: "Skyr nature", kcal100: 60 });
    expect(received.products[0]).not.toHaveProperty("pantryId");
  });
});

describe("« de qui, pour qui » dans un lien", () => {
  it("un identifiant douteux est écarté, les prénoms sont gardés", async () => {
    const payload = withMeta(mealPayload(lasagnes), { from: "Camille", guests: ["Alex"], id: "<script>" });
    const received = await readShare(await shareLink(payload));
    expect(received.from).toBe("Camille");
    expect(received.guests).toEqual(["Alex"]);
    expect(received.id).toBeUndefined();
  });
  it("les anciens liens, sans expéditeur, restent lisibles", async () => {
    const received = await readShare(await shareLink(mealPayload(lasagnes)));
    expect(received.from).toBeUndefined();
    expect(received.kind).toBe("repas");
  });
});

describe("Ma tablée", () => {
  it("ajoute des prénoms sans doublon (casse et accents ignorés)", () => {
    expect(addNames(["Élodie"], ["elodie", " Sam ", "", "Alex"])).toEqual(["Élodie", "Sam", "Alex"]);
  });
  it("« Mangé avec » vu par la personne qui reçoit : l'expéditeur et les autres, pas soi-même", () => {
    expect(companionsFor("Camille", ["Alex", "Sam"], ["Alex", "alexou"])).toEqual(["Camille", "Sam"]);
    expect(companionsFor(undefined, undefined, ["Alex"])).toEqual([]);
  });
  it("écrit les prénoms comme on les dit", () => {
    expect(joinNames(["Alex"])).toBe("Alex");
    expect(joinNames(["Alex", "Sam", "Lou"])).toBe("Alex, Sam et Lou");
  });
  it("le message d'une assiette s'adresse aux invités", () => {
    const text = shareMessage(mealPayload(lasagnes), ["Alex", "Sam"], "Camille", "https://exemple/#partage=x");
    expect(text).toContain("Alex et Sam : ");
    expect(text).toContain("vos parts vous attendent");
    expect(text).toContain("Camille a cuisiné pour 4");
    expect(text).toContain("https://exemple/#partage=x");
  });
});

describe("retour à la personne qui a cuisiné", () => {
  it("le lien dit qui a pris quoi, rattaché au lien du plat", async () => {
    const payload = withMeta(ackPayload({ share: "lien42", name: "Lasagnes maison", part: "1 part · 412 kcal" }), { from: "Alex", guests: ["Camille"], id: "r1" });
    const received = await readShare(await shareLink(payload));
    expect(received.kind).toBe("retour");
    if (received.kind !== "retour") return;
    expect(received.retour).toEqual({ share: "lien42", name: "Lasagnes maison", part: "1 part · 412 kcal" });
    expect(received.from).toBe("Alex");
  });
  it("un retour sans expéditeur est refusé", async () => {
    await expect(readShare(await shareLink(ackPayload({ share: "lien42", name: "Lasagnes", part: "1 part" })))).rejects.toThrow("Retour illisible");
  });
});

// Brouillons (cahier § 4) : rien n'est perdu si Android ferme l'app pendant une saisie.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasContent, mealDraft, recipeDraft, setDraftHours, type MealDraft } from "./drafts";

// Stockage du téléphone, simulé.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
});

const assiette: MealDraft = {
  date: "2026-10-14", category: "dejeuner", mode: "plate", plateName: "Colin riz", servings: 2, parts: 1, adjust: 0, keepLeftover: true, query: "riz",
  lines: [{ name: "Colin", source: "off", quantity: 2, unit: "portion", portionGrams: 100, kcal100: 71, protein100: 16 }],
};

describe("brouillon de repas", () => {
  beforeEach(() => store.clear());

  it("une assiette commencée est retrouvée telle quelle après fermeture de l'app", () => {
    mealDraft.save(assiette, true);
    const repris = mealDraft.load();
    expect(repris).toMatchObject({ ...assiette, open: true });
    expect(hasContent(repris)).toBe(true);
  });

  it("fenêtre fermée : le brouillon reste, sans se rouvrir tout seul", () => {
    mealDraft.save(assiette, true);
    mealDraft.close();
    expect(mealDraft.load()).toMatchObject({ open: false, plateName: "Colin riz" });
  });

  it("repas enregistré : le brouillon disparaît", () => {
    mealDraft.save(assiette, true);
    mealDraft.clear();
    expect(mealDraft.load()).toBeNull();
  });

  it("une fenêtre vide n'est pas un brouillon à reprendre", () => {
    expect(hasContent({ ...assiette, lines: [], plateName: "" })).toBe(false);
  });

  it("un brouillon de plus de 24 h n'est plus proposé", () => {
    store.set("feedme:brouillon-repas", JSON.stringify({ ...assiette, open: true, savedAt: Date.now() - 25 * 3_600_000 }));
    expect(mealDraft.load()).toBeNull();
  });

  it("un stockage illisible ne bloque pas l'app", () => {
    store.set("feedme:brouillon-repas", "{abîmé");
    expect(mealDraft.load()).toBeNull();
  });

  it("un brouillon par moment : le dîner ne remplace pas le déjeuner laissé en plan", () => {
    mealDraft.save(assiette, true);
    mealDraft.close();
    mealDraft.save({ ...assiette, category: "diner", plateName: "Soupe" }, true);
    expect(mealDraft.load("dejeuner")?.plateName).toBe("Colin riz");
    expect(mealDraft.load("diner")?.plateName).toBe("Soupe");
    // Repas du soir enregistré : seul son brouillon disparaît.
    mealDraft.clear();
    expect(mealDraft.load("diner")).toBeNull();
    expect(mealDraft.load("dejeuner")?.plateName).toBe("Colin riz");
  });

  it("changer de moment pendant la saisie déplace le brouillon", () => {
    mealDraft.save(assiette, true);
    mealDraft.save({ ...assiette, category: "collation" }, true);
    expect(mealDraft.load("dejeuner")).toBeNull();
    expect(mealDraft.load("collation")).not.toBeNull();
    mealDraft.clear();
  });

  it("modifier un repas noté ne touche pas au brouillon d'un nouveau repas", () => {
    mealDraft.save(assiette, true);
    mealDraft.close();
    mealDraft.save({ ...assiette, editingId: 42, plateName: "Modif" }, true);
    expect(mealDraft.load("dejeuner")?.plateName).toBe("Colin riz");
    expect(mealDraft.loadEditing(42)?.plateName).toBe("Modif");
    mealDraft.clear();
  });

  it("« Abandonner » un brouillon proposé le supprime", () => {
    mealDraft.save(assiette, true);
    mealDraft.close();
    mealDraft.discard(mealDraft.load("dejeuner")!);
    expect(mealDraft.load("dejeuner")).toBeNull();
  });

  it("durée réglable : gardé 3 jours si on l'a choisi", () => {
    store.set("feedme:brouillon-repas:diner", JSON.stringify({ ...assiette, category: "diner", open: false, savedAt: Date.now() - 50 * 3_600_000 }));
    expect(mealDraft.load("diner")).toBeNull();
    setDraftHours(72);
    expect(mealDraft.load("diner")).not.toBeNull();
    setDraftHours(undefined);
  });

  it("l'ancien brouillon unique (avant la séparation) est encore repris", () => {
    store.set("feedme:brouillon-repas", JSON.stringify({ ...assiette, open: true, savedAt: Date.now() }));
    expect(mealDraft.load("dejeuner")?.plateName).toBe("Colin riz");
  });
});

describe("brouillon de recette", () => {
  beforeEach(() => store.clear());
  const form = { name: "", category: "plat" as const, ingredients: [{ title: "", items: [] }], steps: [{ title: "", steps: [{ title: "", text: "" }] }], time: "", portions: "", calories: "", protein: "", carbs: "", fat: "", volume: "", notes: "", url: "" };

  it("une recette commencée est retrouvée (nom, ingrédients, texte collé)", () => {
    recipeDraft.save({ form: { ...form, name: "Tom-Yum", ingredients: [{ title: "", items: [{ key: 1, quantity: "1", unit: "L", name: "eau" }] }] }, rawText: "Ingrédients…" });
    expect(recipeDraft.load()).toMatchObject({ form: { name: "Tom-Yum" }, rawText: "Ingrédients…" });
  });

  it("un formulaire vide ne se rouvre pas", () => {
    recipeDraft.save({ form, rawText: null });
    expect(recipeDraft.load()).toBeNull();
  });
});

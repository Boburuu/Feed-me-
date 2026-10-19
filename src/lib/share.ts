// Partage d'une recette, d'une assiette ou d'un repas (cahier § 7) : en lien ou en fichier JSON.
//
// Le lien est autonome : tout le contenu est dans le lien lui-même (compressé), aucun
// serveur ne le garde. À l'arrivée, rien n'est ajouté sans confirmation : la recette passe
// par un aperçu, le repas s'ouvre pré-rempli dans « Ajouter un repas ». Un partage vient
// de quelqu'un d'autre : chaque champ est vérifié et seuls les champs connus sont gardés.

import { normalize } from "./foods";
import type { FoodSource, IngredientGroup, Meal, MealCategory, MealItem, Recipe, RecipeCategory, StepGroup } from "./storage";

export const SHARE_BASE_URL = "https://boburuu.github.io/Feed-me-/";
const HASH_KEY = "partage=";
/** Au-delà, le lien ne passe plus dans un message Discord (2000 caractères). */
export const LINK_COMFORT_LENGTH = 1900;
const MAX_BYTES = 300_000;

export type SharedRecipe = Omit<Recipe, "id" | "images">;
export type SharedMeal = Pick<Meal, "name" | "category" | "items" | "plate">;
export type SharePayload =
  | { app: "feedme"; version: 1; kind: "recette"; sharedAt: string; recipe: SharedRecipe }
  | { app: "feedme"; version: 1; kind: "repas"; sharedAt: string; meal: SharedMeal & { items: MealItem[] } };

// --- Préparer un partage --------------------------------------------------------------

/** Champs propres à l'appareil (références locales, vérifications) retirés de l'aliment. */
function portableItem(item: MealItem): MealItem {
  const { corrected: _c, labelChecked: _l, refKcal100: _r, refName: _n, ...rest } = item;
  // Recette, aliment perso ou reste : la référence ne vaut que dans le carnet de l'expéditeur.
  const local = rest.source === "recette" || rest.source === "perso";
  return local ? { ...rest, ref: undefined } : rest;
}

export function recipePayload(recipe: Recipe): SharePayload {
  const { id: _id, images: _images, ...rest } = recipe;
  return {
    app: "feedme", version: 1, kind: "recette", sharedAt: new Date().toISOString(),
    recipe: { ...rest, ingredients: rest.ingredients.map((group) => ({ ...group, items: group.items.map((item) => (item.food ? { ...item, food: portableItem(item.food) } : item)) })) },
  };
}

export function mealPayload(meal: Meal): SharePayload {
  return {
    app: "feedme", version: 1, kind: "repas", sharedAt: new Date().toISOString(),
    meal: { name: meal.name, category: meal.category, items: (meal.items ?? []).map(portableItem), ...(meal.plate ? { plate: meal.plate } : {}) },
  };
}

// --- Encodage du lien ------------------------------------------------------------------

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  const reader = output.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) throw new Error("Partage trop volumineux.");
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}

export async function shareLink(payload: SharePayload) {
  const packed = await transform(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate-raw"));
  return `${SHARE_BASE_URL}#${HASH_KEY}${toBase64Url(packed)}`;
}

export const shareFileName = (payload: SharePayload) =>
  `feedme-${payload.kind}-${normalize(payload.kind === "recette" ? payload.recipe.name : payload.meal.name).replace(/ /g, "-").slice(0, 40) || "partage"}.json`;

// --- Lecture et vérification -------------------------------------------------------------

export class ShareError extends Error {}

const text = (value: unknown, max = 2000) => (typeof value === "string" ? value.slice(0, max) : undefined);
const number = (value: unknown, min = 0, max = 100_000) => (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined);
const nullable = (value: unknown, min = 0, max = 100_000) => (value === null ? null : number(value, min, max));
const sources: FoodSource[] = ["ciqual", "off", "recette", "perso", "enseigne"];
const mealCategories: MealCategory[] = ["petit-dejeuner", "dejeuner", "diner", "collation"];
const recipeCategories: RecipeCategory[] = ["petit-dejeuner", "apero", "entree", "plat", "dessert", "gouter", "boisson"];
const object = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []);
/** Retire les clés « undefined » : l'objet ne garde que ce qui a été vérifié. */
const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

function checkItem(value: unknown): MealItem | null {
  const item = object(value);
  if (!item) return null;
  const name = text(item.name, 200);
  const source = sources.find((entry) => entry === item.source);
  const quantity = number(item.quantity, 0, 100_000);
  const kcal100 = number(item.kcal100, 0, 10_000);
  if (!name || !source || quantity === undefined || kcal100 === undefined || (item.unit !== "g" && item.unit !== "portion")) return null;
  const local = source === "recette" || source === "perso";
  return clean({
    name, source, quantity, kcal100, unit: item.unit,
    ref: local ? undefined : text(item.ref, 100),
    protein100: nullable(item.protein100) ?? null,
    carbs100: nullable(item.carbs100), fat100: nullable(item.fat100),
    cookedFactor: number(item.cookedFactor, 1, 10), weighedCooked: item.weighedCooked === true || undefined,
    hydrates: typeof item.hydrates === "boolean" ? item.hydrates : undefined,
    drinkMlPerPart: number(item.drinkMlPerPart), cookedBy: item.cookedBy === "emballage" ? "emballage" : undefined, waterMl: number(item.waterMl, 0, 5000), prepared: item.prepared === true || undefined, density: number(item.density, 0.3, 3), volumeUnit: (["ml", "cl", "dl", "L"] as const).find((unit) => unit === item.volumeUnit), portionGrams: number(item.portionGrams), portionLabel: text(item.portionLabel, 120),
    liquid: item.liquid === true || undefined, packageGrams: number(item.packageGrams), servingGrams: number(item.servingGrams), servingLabel: text(item.servingLabel, 120),
    pieceGrams: number(item.pieceGrams), pieceLabel: text(item.pieceLabel, 120), matchedName: text(item.matchedName, 200), choice: text(item.choice, 120),
    recipePortions: number(item.recipePortions, 1, 1000),
    recipePieces: number(item.recipePieces, 1, 1000), recipeGrams: number(item.recipeGrams), recipeGramsEstimated: item.recipeGramsEstimated === true || undefined,
    recipeCount: (["parts", "pieces", "grams"] as const).find((count) => count === item.recipeCount),
  }) as MealItem;
}

function checkRecipe(value: unknown): SharedRecipe {
  const recipe = object(value);
  const name = text(recipe?.name, 200)?.trim();
  if (!recipe || !name) throw new ShareError("Recette illisible : il manque son nom.");
  const ingredients: IngredientGroup[] = list(recipe.ingredients, 30).flatMap((raw) => {
    const group = object(raw);
    if (!group) return [];
    return [{
      title: text(group.title, 120) ?? "",
      items: list(group.items, 200).flatMap((rawItem) => {
        const item = object(rawItem);
        const itemName = text(item?.name, 300);
        if (!item || !itemName) return [];
        const food = item.food === undefined ? undefined : checkItem(item.food) ?? undefined;
        return [clean({ name: itemName, quantity: nullable(item.quantity) ?? null, unit: text(item.unit, 40) ?? "", food })];
      }),
    }];
  });
  const steps: StepGroup[] = list(recipe.steps, 30).flatMap((raw) => {
    const group = object(raw);
    if (!group) return [];
    return [{ title: text(group.title, 120) ?? "", steps: list(group.steps, 200).flatMap((rawStep) => { const step = object(rawStep); const body = text(step?.text, 4000); return body ? [{ title: text(step!.title, 120) ?? "", text: body }] : []; }) }];
  });
  const url = text(recipe.url, 500);
  return clean({
    name, ingredients, steps,
    time: number(recipe.time, 0, 10_000) ?? 0,
    portions: number(recipe.portions, 1, 1000) ?? 1,
    calories: number(recipe.calories, 0, 20_000) ?? 0,
    protein: number(recipe.protein, 0, 2000) ?? 0,
    carbs: number(recipe.carbs, 0, 2000), fat: number(recipe.fat, 0, 2000),
    volumeMl: number(recipe.volumeMl), pieces: number(recipe.pieces, 1, 1000), totalGrams: number(recipe.totalGrams), nutritionManual: recipe.nutritionManual === true || undefined,
    category: recipeCategories.find((entry) => entry === recipe.category),
    // Seuls les liens web sont gardés (pas de « javascript: »).
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    notes: text(recipe.notes, 4000),
  }) as SharedRecipe;
}

type CheckedMeal = SharedMeal & { items: MealItem[] };

function checkMeal(value: unknown): CheckedMeal {
  const meal = object(value);
  const items = list(meal?.items, 200).map(checkItem).filter((item): item is MealItem => !!item);
  if (!meal || !items.length) throw new ShareError("Repas illisible : aucun aliment reconnu.");
  const plate = object(meal.plate);
  const servings = number(plate?.servings, 1, 100);
  const share = number(plate?.share, 0.01, 1);
  return clean({
    name: text(meal.name, 200) ?? "Repas partagé",
    category: mealCategories.find((entry) => entry === meal.category) ?? "dejeuner",
    items,
    plate: servings && share ? { servings, share } : undefined,
  }) as CheckedMeal;
}

/** Contenu vérifié d'un partage (objet JSON déjà lu). */
export function checkPayload(value: unknown): SharePayload {
  const payload = object(value);
  if (!payload || payload.app !== "feedme") throw new ShareError("Ce n'est pas un partage Feed Me.");
  if (payload.version !== 1) throw new ShareError("Partage fait avec une version plus récente de Feed Me : mets l'appli à jour.");
  const sharedAt = text(payload.sharedAt, 40) ?? new Date().toISOString();
  if (payload.kind === "recette") return { app: "feedme", version: 1, kind: "recette", sharedAt, recipe: checkRecipe(payload.recipe) };
  if (payload.kind === "repas") return { app: "feedme", version: 1, kind: "repas", sharedAt, meal: checkMeal(payload.meal) };
  throw new ShareError("Type de partage inconnu.");
}

/** Lien, morceau de lien ou texte JSON collé → partage vérifié. */
export async function readShare(input: string): Promise<SharePayload> {
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    if (trimmed.length > MAX_BYTES) throw new ShareError("Fichier trop volumineux pour un partage.");
    try { return checkPayload(JSON.parse(trimmed)); } catch (error) { throw error instanceof ShareError ? error : new ShareError("Fichier JSON illisible."); }
  }
  const at = trimmed.indexOf(HASH_KEY);
  const code = (at >= 0 ? trimmed.slice(at + HASH_KEY.length) : trimmed).split(/[\s&]/)[0];
  if (!/^[A-Za-z0-9_-]{10,}$/.test(code)) throw new ShareError("Lien de partage incomplet : copie-le en entier.");
  let json: string;
  try {
    json = new TextDecoder().decode(await transform(fromBase64Url(code), new DecompressionStream("deflate-raw")));
  } catch (error) {
    throw error instanceof ShareError ? error : new ShareError("Lien de partage abîmé ou incomplet : copie-le en entier.");
  }
  try { return checkPayload(JSON.parse(json)); } catch (error) { throw error instanceof ShareError ? error : new ShareError("Lien de partage illisible."); }
}

/** Le lien d'ouverture de la page (#partage=…), s'il y en a un. */
export const shareInHash = (hash: string) => (hash.includes(HASH_KEY) ? hash.slice(hash.indexOf(HASH_KEY)) : null);

// --- Doublons ------------------------------------------------------------------------------

/** Empreinte d'une recette : nom, ingrédients et étapes (pas l'id, ni les photos). */
export function recipeFingerprint(recipe: Pick<Recipe, "name" | "ingredients" | "steps">) {
  const ingredients = recipe.ingredients.flatMap((group) => group.items.map((item) => `${normalize(item.name)}:${item.quantity ?? ""}${item.unit}`)).sort();
  const steps = recipe.steps.flatMap((group) => group.steps.map((step) => normalize(step.text)));
  return `${normalize(recipe.name)}|${ingredients.join(",")}|${steps.join("/")}`;
}

/** Recette déjà dans le carnet (même contenu), ou recette du même nom mais différente. */
export function recipeConflict(recipes: Recipe[], shared: SharedRecipe) {
  const print = recipeFingerprint(shared);
  const same = recipes.find((recipe) => recipeFingerprint(recipe) === print);
  if (same) return { kind: "same" as const, recipe: same };
  const named = recipes.find((recipe) => normalize(recipe.name) === normalize(shared.name));
  return named ? { kind: "name" as const, recipe: named } : null;
}

/** Nom libre pour une copie : « Tarte (2) », « Tarte (3) »… */
export function freeName(recipes: Recipe[], name: string) {
  const taken = new Set(recipes.map((recipe) => normalize(recipe.name)));
  for (let index = 2; ; index += 1) if (!taken.has(normalize(`${name} (${index})`))) return `${name} (${index})`;
}

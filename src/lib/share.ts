// Partage d'une recette, d'une assiette, d'un repas, d'ingrédients, des repas prévus, de la liste
// de courses ou de tout le carnet (cahier § 7) : en lien ou en fichier JSON.
//
// Le lien est autonome : tout le contenu est dans le lien lui-même (compressé), aucun
// serveur ne le garde. À l'arrivée, rien n'est ajouté sans confirmation : la recette passe
// par un aperçu, le repas s'ouvre pré-rempli dans « Ajouter un repas ». Un partage vient
// de quelqu'un d'autre : chaque champ est vérifié et seuls les champs connus sont gardés.

import { normalize } from "./foods";
import { packShare, unpackShare } from "./sharePack";
import type { FoodSource, IngredientGroup, Meal, MealCategory, MealItem, Recipe, RecipeCategory, StepGroup } from "./storage";

export const SHARE_BASE_URL = "https://boburuu.github.io/Feed-me-/";
const HASH_KEY = "partage=";
/** Au-delà, le lien ne passe plus dans un message Discord (2000 caractères). */
export const LINK_COMFORT_LENGTH = 1900;
const MAX_BYTES = 300_000;
/** Retire les clés « undefined » : l'objet ne garde que ce qui a été vérifié. */
const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

export type SharedRecipe = Omit<Recipe, "id" | "images">;
export type SharedMeal = Pick<Meal, "name" | "category" | "items" | "plate">;
/** Repas prévu partagé : il arrive « prévu » chez l'autre, rien ne compte avant « Mangé ». */
export type SharedPlanned = Pick<Meal, "name" | "category" | "date" | "calories" | "protein" | "carbs" | "fat" | "plate"> & { items?: MealItem[] };
export type ShoppingShareLine = { name: string; qty: string };
/**
 * De qui et pour qui (prénoms seulement) : chez la personne qui reçoit, « Mangé avec » se
 * remplit tout seul. L'identifiant repère un lien déjà ouvert.
 */
export type ShareMeta = { from?: string; guests?: string[]; id?: string };
export type SharePayload = { app: "feedme"; version: 1; sharedAt: string } & ShareMeta & (
  | { kind: "recette"; recipe: SharedRecipe }
  | { kind: "repas"; meal: SharedMeal & { items: MealItem[] } }
  | { kind: "ingredients"; products: MealItem[] }
  | { kind: "semaine"; meals: SharedPlanned[] }
  | { kind: "courses"; lines: ShoppingShareLine[] }
  | { kind: "carnet"; recipes: SharedRecipe[]; products: MealItem[] }
  | { kind: "retour"; retour: AckInfo }
);
/** Retour à la personne qui a cuisiné : qui (from), quel lien, quel plat, quelle part. */
export type AckInfo = { share: string; name: string; part: string };

// --- Préparer un partage --------------------------------------------------------------

/** Champs propres à l'appareil (références locales, vérifications) retirés de l'aliment. */
function portableItem(item: MealItem): MealItem {
  const { corrected: _c, labelChecked: _l, refKcal100: _r, refName: _n, ...rest } = item;
  // Recette, aliment perso ou reste : la référence ne vaut que dans le carnet de l'expéditeur.
  const local = rest.source === "recette" || rest.source === "perso";
  return local ? { ...rest, ref: undefined } : rest;
}

/** Recette sans son identifiant ni ses photos (propres au téléphone). */
function portableRecipe(recipe: Recipe): SharedRecipe {
  const { id: _id, images: _images, ...rest } = recipe;
  return { ...rest, ingredients: rest.ingredients.map((group) => ({ ...group, items: group.items.map((item) => (item.food ? { ...item, food: portableItem(item.food) } : item)) })) };
}

/** Produit de « Mes ingrédients » sans son rang dans la liste. */
function portableProduct(item: MealItem) {
  const { pantryId: _id, addedAt: _added, ...rest } = item as MealItem & { pantryId?: number; addedAt?: string };
  return portableItem(rest);
}

const now = () => new Date().toISOString();

export function recipePayload(recipe: Recipe): SharePayload {
  return { app: "feedme", version: 1, kind: "recette", sharedAt: now(), recipe: portableRecipe(recipe) };
}

/** Produits de « Mes ingrédients » (un seul ou toute la liste), sans les photos. */
export function ingredientsPayload(items: MealItem[]): SharePayload {
  return { app: "feedme", version: 1, kind: "ingredients", sharedAt: now(), products: items.map(portableProduct) };
}

/** Repas prévus (une semaine…) : chez l'autre, ils arrivent « prévus ». */
export function weekPayload(meals: Meal[]): SharePayload {
  return {
    app: "feedme", version: 1, kind: "semaine", sharedAt: now(),
    meals: meals.map((meal) => clean({
      name: meal.name, category: meal.category, date: meal.date, calories: meal.calories,
      protein: meal.protein, carbs: meal.carbs, fat: meal.fat, plate: meal.plate,
      items: meal.items?.length ? meal.items.map(portableItem) : undefined,
    }) as SharedPlanned),
  };
}

/** Liste de courses : article et quantité déjà mise en forme (« 450 g », « 2 tranches »). */
export function shoppingPayload(lines: ShoppingShareLine[]): SharePayload {
  return { app: "feedme", version: 1, kind: "courses", sharedAt: now(), lines };
}

/** Tout le carnet : recettes (sans photos) et « Mes ingrédients ». */
export function carnetPayload(recipes: Recipe[], products: MealItem[]): SharePayload {
  return { app: "feedme", version: 1, kind: "carnet", sharedAt: now(), recipes: recipes.map(portableRecipe), products: products.map(portableProduct) };
}

/** « J'ai pris 1 part » : renvoyé à la personne qui a cuisiné, rattaché à son lien. */
export function ackPayload(retour: AckInfo): SharePayload {
  return { app: "feedme", version: 1, kind: "retour", sharedAt: now(), retour };
}

/** De qui et pour qui, ajoutés au moment d'envoyer. */
export function withMeta(payload: SharePayload, meta: ShareMeta): SharePayload {
  return clean({ ...payload, from: meta.from || undefined, guests: meta.guests?.length ? meta.guests : undefined, id: meta.id }) as SharePayload;
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Nom affiché d'un partage (fichier, aperçu). */
export function shareName(payload: SharePayload) {
  switch (payload.kind) {
    case "recette": return payload.recipe.name;
    case "repas": return payload.meal.name;
    case "ingredients": return payload.products.length === 1 ? payload.products[0].name : `${payload.products.length} ingrédients`;
    case "semaine": return plural(payload.meals.length, "repas prévu");
    case "courses": return `Liste de courses (${plural(payload.lines.length, "article")})`;
    case "retour": return `${payload.from ?? "Quelqu'un"} a pris ${payload.retour.part}`;
    case "carnet": return `Carnet${payload.from ? ` de ${payload.from}` : ""} (${plural(payload.recipes.length, "recette")}, ${plural(payload.products.length, "ingrédient")})`;
  }
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
  // Format compact (champs abrégés, nombres arrondis) : un lien deux fois plus court environ.
  const packed = await transform(new TextEncoder().encode(JSON.stringify(packShare(payload as unknown as Record<string, unknown>))), new CompressionStream("deflate-raw"));
  return `${SHARE_BASE_URL}#${HASH_KEY}${toBase64Url(packed)}`;
}

export const shareFileName = (payload: SharePayload) =>
  `feedme-${payload.kind}-${normalize(shareName(payload)).replace(/ /g, "-").slice(0, 40) || "partage"}.json`;

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

const dateKey = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

function checkPlanned(value: unknown): SharedPlanned | null {
  const meal = object(value);
  const name = text(meal?.name, 200)?.trim();
  const date = dateKey(meal?.date);
  if (!meal || !name || !date) return null;
  const items = list(meal.items, 200).map(checkItem).filter((item): item is MealItem => !!item);
  const plate = object(meal.plate);
  const servings = number(plate?.servings, 1, 100);
  const share = number(plate?.share, 0.01, 1);
  return clean({
    name, date,
    category: mealCategories.find((entry) => entry === meal.category) ?? "dejeuner",
    calories: number(meal.calories, 0, 20_000) ?? 0,
    protein: number(meal.protein, 0, 2000), carbs: number(meal.carbs, 0, 2000), fat: number(meal.fat, 0, 2000),
    items: items.length ? items : undefined,
    plate: servings && share ? { servings, share } : undefined,
  }) as SharedPlanned;
}

/** Recettes d'un carnet : celles qui sont illisibles sont laissées de côté. */
function checkRecipes(value: unknown) {
  return list(value, 300).flatMap((raw) => { try { return [checkRecipe(raw)]; } catch { return []; } });
}

/** De qui, pour qui : prénoms courts, identifiant fait de lettres et de chiffres. */
function checkMeta(payload: Record<string, unknown>): ShareMeta {
  const from = text(payload.from, 40)?.trim();
  const guests = list(payload.guests, 20).map((name) => text(name, 40)?.trim()).filter((name): name is string => !!name);
  const id = text(payload.id, 40);
  return clean({ from: from || undefined, guests: guests.length ? guests : undefined, id: id && /^[a-z0-9]+$/i.test(id) ? id : undefined });
}

/** Contenu vérifié d'un partage (objet JSON déjà lu). */
export function checkPayload(value: unknown): SharePayload {
  const payload = object(value);
  if (!payload || payload.app !== "feedme") throw new ShareError("Ce n'est pas un partage Feed Me.");
  if (payload.version !== 1) throw new ShareError("Partage fait avec une version plus récente de Feed Me : mets l'appli à jour.");
  const base = { app: "feedme" as const, version: 1 as const, sharedAt: text(payload.sharedAt, 40) ?? new Date().toISOString(), ...checkMeta(payload) };
  if (payload.kind === "recette") return { ...base, kind: "recette", recipe: checkRecipe(payload.recipe) };
  if (payload.kind === "repas") return { ...base, kind: "repas", meal: checkMeal(payload.meal) };
  if (payload.kind === "ingredients") {
    const products = list(payload.products, 100).map(checkItem).filter((item): item is MealItem => !!item);
    if (!products.length) throw new ShareError("Ingrédients illisibles : aucun produit reconnu.");
    return { ...base, kind: "ingredients", products };
  }
  if (payload.kind === "semaine") {
    const meals = list(payload.meals, 100).map(checkPlanned).filter((meal): meal is SharedPlanned => !!meal);
    if (!meals.length) throw new ShareError("Repas prévus illisibles : aucun repas reconnu.");
    return { ...base, kind: "semaine", meals };
  }
  if (payload.kind === "courses") {
    const lines = list(payload.lines, 300).flatMap((raw) => {
      const line = object(raw);
      const name = text(line?.name, 200)?.trim();
      return name ? [{ name, qty: text(line!.qty, 80)?.trim() ?? "" }] : [];
    });
    if (!lines.length) throw new ShareError("Liste de courses vide ou illisible.");
    return { ...base, kind: "courses", lines };
  }
  if (payload.kind === "carnet") {
    const recipes = checkRecipes(payload.recipes);
    const products = list(payload.products, 300).map(checkItem).filter((item): item is MealItem => !!item);
    if (!recipes.length && !products.length) throw new ShareError("Carnet vide ou illisible.");
    return { ...base, kind: "carnet", recipes, products };
  }
  if (payload.kind === "retour") {
    const retour = object(payload.retour);
    const share = text(retour?.share, 40);
    const name = text(retour?.name, 200)?.trim();
    const part = text(retour?.part, 80)?.trim();
    if (!share || !/^[a-z0-9]+$/i.test(share) || !name || !part || !base.from) throw new ShareError("Retour illisible.");
    return { ...base, kind: "retour", retour: { share, name, part } };
  }
  throw new ShareError("Type de partage inconnu : mets Feed Me à jour pour l'ouvrir.");
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
  try { return checkPayload(unpackShare(JSON.parse(json))); } catch (error) { throw error instanceof ShareError ? error : new ShareError("Lien de partage illisible."); }
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

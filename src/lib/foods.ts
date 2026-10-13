// Recherche d'aliments et calcul des valeurs d'un repas.
//
// Sources :
// - Ciqual 2020 (ANSES) : table officielle française, ~2 300 aliments et plats,
//   embarquée dans l'app (hors ligne). Valeurs pour 100 g.
// - Open Food Facts : base collaborative des produits de marque, valeurs recopiées
//   des emballages. En ligne uniquement.
// - Les recettes du carnet (par portion) et les aliments créés par l'utilisateur.

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { commonFoods, type CommonFood } from "./commonFoods";
import type { CustomFood, MealItem, Recipe } from "./storage";

export type FoodResult = Omit<MealItem, "quantity" | "unit"> & {
  /** Précision affichée sous le nom (marque, « Ciqual », « Ma recette »…). */
  detail: string;
  /** Marque d'un produit Open Food Facts, ajoutée au nom dans le journal. */
  brand?: string;
  /** Recette : valeurs par portion, sans poids connu. */
  perPortionOnly?: boolean;
};

// --- Normalisation ------------------------------------------------------------------

/** Minuscules, sans accents, « œ » → « oe » : « Bœuf » trouve « Boeuf ». */
export function normalize(text: string) {
  return text.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// --- Portions courantes ---------------------------------------------------------------
// Ciqual donne des valeurs pour 100 g, pas de poids de portion. Poids moyens usuels
// (partie comestible), arrondis : l'utilisateur peut toujours corriger les grammes.

// Les motifs portent sur le nom normalisé (sans accents ni ponctuation) : « banane pulpe crue ».
const portions: { match: RegExp; label: string; grams: number }[] = [
  { match: /^pomme de terre/, label: "1 pomme de terre", grams: 150 },
  { match: /^banane pulpe/, label: "1 banane", grams: 120 },
  { match: /^pomme( \w+)* pulpe/, label: "1 pomme", grams: 150 },
  { match: /^poire( \w+)* pulpe/, label: "1 poire", grams: 150 },
  { match: /^orange( \w+)* pulpe/, label: "1 orange", grams: 130 },
  { match: /^(clementine|mandarine)/, label: "1 clémentine", grams: 60 },
  { match: /^kiwi/, label: "1 kiwi", grams: 75 },
  { match: /^(peche|nectarine)( \w+)* pulpe/, label: "1 pêche", grams: 130 },
  { match: /^abricot( \w+)* (pulpe|cru)/, label: "1 abricot", grams: 45 },
  { match: /^avocat( \w+)* (pulpe|cru)/, label: "1 avocat", grams: 150 },
  { match: /^tomate crue/, label: "1 tomate", grams: 120 },
  { match: /^oeuf (dur|poche|a la coque|cru|brouille|au plat|mollet)/, label: "1 œuf", grams: 55 },
  { match: /^baguette/, label: "¼ de baguette", grams: 60 },
  { match: /^pain de mie/, label: "1 tranche", grams: 25 },
  { match: /^pain (complet|blanc|aux cereales|de campagne|au levain)/, label: "1 tranche", grams: 35 },
  { match: /^croissant/, label: "1 croissant", grams: 45 },
  { match: /^(pain au chocolat|chocolatine)/, label: "1 pain au chocolat", grams: 60 },
  { match: /^(yaourt|lait fermente ou specialite laitiere type yaourt)/, label: "1 pot", grams: 125 },
  { match: /^fromage blanc/, label: "1 portion", grams: 100 },
  { match: /^petit suisse/, label: "1 petit-suisse", grams: 60 },
  { match: /^(lait (demi ecreme|entier|ecreme)|boisson (au soja|vegetale))/, label: "1 verre", grams: 200 },
  { match: /^(jus d|nectar)/, label: "1 verre", grams: 200 },
  { match: /^(soda|boisson gazeuse|cola)/, label: "1 canette", grams: 330 },
  { match: /^biere/, label: "1 demi", grams: 250 },
  { match: /^vin (rouge|blanc|rose)/, label: "1 verre", grams: 120 },
  { match: /^(cafe|the) (noir|infusion|non sucre|sans sucre|infuse|vert)/, label: "1 tasse", grams: 150 },
  { match: /^jambon (cuit|blanc|de paris)/, label: "1 tranche", grams: 45 },
  { match: /steak hache/, label: "1 steak haché", grams: 100 },
  { match: /^poulet filet/, label: "1 filet", grams: 120 },
  { match: /^(camembert|brie|emmental|comte|gruyere|coulommiers|reblochon|roquefort|chevre)/, label: "1 portion", grams: 30 },
  { match: /^beurre/, label: "1 noisette", grams: 10 },
  { match: /^huile/, label: "1 c. à soupe", grams: 10 },
  { match: /^sucre (blanc|roux)/, label: "1 morceau", grams: 5 },
  { match: /^chocolat (noir|au lait|blanc)/, label: "1 carré", grams: 5 },
  { match: /^(riz|pates|semoule|quinoa|boulgour)( \w+)* cuit/, label: "1 assiette", grams: 200 },
  { match: /^pizza/, label: "1 part", grams: 120 },
  { match: /^(soupe|veloute)/, label: "1 bol", grams: 250 },
  { match: /^(agneau|boeuf|veau|porc|poulet|dinde|canard|mouton|saumon|cabillaud|thon)( \w+)* (roti|grille|poele|braise|cuit|vapeur)/, label: "1 portion", grams: 120 },
  { match: /bourguignon|blanquette|pot au feu|couscous|tajine|lasagne|hachis parmentier|chili con carne|paella|risotto|gratin dauphinois|choucroute|cassoulet|curry/, label: "1 assiette", grams: 300 },
];

export function portionFor(name: string) {
  const key = normalize(name);
  return portions.find((item) => item.match.test(key));
}

// --- Ciqual (hors ligne) ---------------------------------------------------------------

type CiqualRow = [number, string, number, number | null, number | null, number | null, string];
type CiqualIndex = { rows: CiqualRow[]; keys: string[] };
let ciqual: Promise<CiqualIndex> | null = null;

/** La table n'est chargée qu'à la première recherche. */
function loadCiqual() {
  ciqual ??= import("../data/ciqual.json").then((module) => {
    const rows = (module.default as unknown as { foods: CiqualRow[] }).foods;
    return { rows, keys: rows.map((row) => normalize(row[1])) };
  });
  return ciqual;
}

/** Score de pertinence : tous les mots cherchés doivent apparaître. */
function score(key: string, words: string[], query: string) {
  const tokens = key.split(" ");
  if (!words.every((word) => tokens.some((token) => token.startsWith(word)) || key.includes(word))) return 0;
  let value = 100 - key.length * 0.5;
  if (key.startsWith(query)) value += 60;
  if (tokens[0].startsWith(words[0])) value += 30;
  // Version de base de l'aliment : crue, nature, « aliment moyen ».
  if (/\b(cru|crue|nature|aliment moyen|pulpe)\b/.test(key)) value += 12;
  if (/\b(deshydrate|lyophilise|en poudre|appertise)\b/.test(key)) value -= 10;
  return value;
}

export async function searchCiqual(query: string, limit = 12): Promise<FoodResult[]> {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  const words = normalized.split(" ");
  const { rows, keys } = await loadCiqual();
  return keys
    .map((key, index) => ({ index, score: score(key, words, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ index }) => {
      const [code, name, kcal, protein] = rows[index];
      const portion = portionFor(name);
      return {
        name,
        source: "ciqual" as const,
        ref: String(code),
        kcal100: kcal,
        protein100: protein,
        portionGrams: portion?.grams,
        portionLabel: portion?.label,
        detail: "Ciqual (ANSES)",
      };
    });
}

// --- Aliments courants (noms simples) ------------------------------------------------------

/** « banane », « bananes », « ban » trouvent « Banane » ; les synonymes comptent aussi. */
function commonScore(food: CommonFood, query: string) {
  let best = 0;
  for (const key of [normalize(food.name), ...(food.aliases ?? []).map(normalize)]) {
    if (key === query) best = Math.max(best, 100);
    else if (query.startsWith(key) && query.length - key.length <= 2) best = Math.max(best, 90); // pluriel
    else if (key.startsWith(query)) best = Math.max(best, 80 - key.length * 0.5);
    else if (key.split(" ").some((word) => word.startsWith(query))) best = Math.max(best, 50);
    // Chaque mot cherché doit commencer un mot du nom : « oeuf » ne trouve pas « boeuf ».
    else if (query.split(" ").every((word) => key.split(" ").some((part) => part.startsWith(word)))) best = Math.max(best, 40);
  }
  return best;
}

export async function searchCommon(query: string, limit = 4): Promise<FoodResult[]> {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  const { rows } = await loadCiqual();
  byName ??= new Map(rows.map((row) => [row[1], row]));
  return commonFoods
    .map((food) => ({ food, score: commonScore(food, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .flatMap(({ food }) => commonResult(food));
}

function commonResult(food: CommonFood): FoodResult[] {
  const row = byName!.get(food.ciqual);
  if (!row) return [];
  return [{
    name: food.name,
    source: "ciqual" as const,
    // Plusieurs noms simples peuvent viser la même ligne Ciqual (Coca zéro, Pepsi Max) :
    // le nom simple fait partie de la référence pour les distinguer.
    ref: `${row[0]}:${normalize(food.name)}`,
    kcal100: row[2],
    protein100: row[3],
    portionGrams: food.portion?.grams,
    portionLabel: food.portion?.label,
    liquid: food.drink || undefined,
    packageGrams: food.packageGrams,
    detail: "Ciqual (ANSES)",
  }];
}

/** Boissons courantes, pour le raccourci de l'ajout de repas. */
export async function drinkShortcuts(): Promise<FoodResult[]> {
  const { rows } = await loadCiqual();
  byName ??= new Map(rows.map((row) => [row[1], row]));
  // Les plus bues d'abord (les 8 premières sont visibles sans « + autres »).
  const first = ["Eau", "Café", "Coca zéro / light", "Pepsi Max", "Coca / Pepsi", "Chocolat chaud", "Smoothie", "Thé"];
  const rank = (name: string) => (first.includes(name) ? first.indexOf(name) : first.length);
  return commonFoods.filter((food) => food.drink).sort((a, b) => rank(a.name) - rank(b.name)).flatMap(commonResult);
}
let byName: Map<string, CiqualRow> | null = null;

// --- Open Food Facts (en ligne) ----------------------------------------------------------

const OFF_HEADERS = { "User-Agent": "FeedMe/1.0 (application personnelle de suivi nutritionnel)" };

/** Sur le téléphone, la requête passe par le réseau natif : le serveur n'autorise pas l'app web. */
async function getJson(url: string) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers: OFF_HEADERS, connectTimeout: 10_000, readTimeout: 15_000 });
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    return typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

type OffNutriments = Record<string, number | undefined>;
type OffHit = { code?: string; product_name?: string; product_name_fr?: string; brands?: string[] | string; nutriments?: OffNutriments; quantity?: string };

/**
 * Contenance d'un emballage, telle qu'Open Food Facts l'écrit : « 150g », « 440 gr »,
 * « 0,85 L », « 4 x 125 g » (on garde une unité du lot). Renvoie des grammes ou des ml.
 */
export function parsePackage(text: unknown): number | undefined {
  const value = String(text ?? "").toLowerCase().replace(",", ".");
  const match = value.match(/(?:\d+\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gr|grammes?|l|litres?|cl|ml)\b/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const factor = { kg: 1000, g: 1, gr: 1, gramme: 1, grammes: 1, l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1 }[match[2]] ?? 1;
  const grams = Math.round(amount * factor);
  return grams > 0 && grams <= 10000 ? grams : undefined;
}

/** Ce qui se compte dans un paquet (au singulier). */
const pieceWords = ["tranche", "feuille", "galette", "pièce", "piece", "biscuit", "sachet", "barre", "œuf", "oeuf", "crêpe", "crepe", "wrap", "tortilla", "bâtonnet", "batonnet", "nugget", "steak", "saucisse", "filet", "cookie", "madeleine", "muffin", "croissant", "brioche", "gaufre", "blini", "nem", "samoussa", "pot", "capsule", "dosette"];
const piecePattern = new RegExp(`(\\d+)\\s*(${pieceWords.join("|")})[sx]?(?![\\p{L}])(?!\\s*(?:de|d'|x|×)\\s*\\d)`, "iu");

/**
 * Paquet vendu à la pièce : « Jambon 4 tranches 160 g », « 10 feuilles de riz 100 g ».
 * Renvoie le poids d'une pièce (160 g ÷ 4 = 40 g). « 6 pots de 125 g » n'est pas un
 * nombre de pièces à diviser : la contenance lue est déjà celle d'un pot.
 */
export function parsePieces(text: string, packageGrams: number | undefined) {
  const match = text.match(piecePattern);
  if (!match || !packageGrams) return undefined;
  const count = Number(match[1]);
  const grams = Math.round((packageGrams / count) * 10) / 10;
  if (count < 2 || count > 60 || grams < 1) return undefined;
  const word = match[2].toLowerCase().replace(/^oeuf$/, "œuf").replace(/^piece$/, "pièce").replace(/^crepe$/, "crêpe").replace(/^batonnet$/, "bâtonnet");
  return { pieceGrams: grams, pieceLabel: `1 ${word}` };
}

/** Nombre de mots de la recherche présents dans un texte. */
function wordsFound(query: string, text: string) {
  const words = new Set(normalize(text).split(" "));
  return normalize(query).split(" ").filter((word) => word.length >= 2 && [...words].some((part) => part.startsWith(word))).length;
}

const brandOf = (brands: OffHit["brands"]) => (Array.isArray(brands) ? brands[0] : brands?.split(",")[0])?.trim() ?? "";

export async function searchOpenFoodFacts(query: string, signal?: { cancelled: boolean }): Promise<FoodResult[]> {
  const fields = "code,product_name,product_name_fr,brands,nutriments,quantity";
  // Le moteur récent refuse les requêtes venant d'un site web (version iPhone) :
  // dans un navigateur, on passe par l'ancien, qui les accepte.
  const url = Capacitor.isNativePlatform()
    ? `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&langs=fr&fields=${fields}`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=${fields}`;
  const data = await getJson(url);
  if (signal?.cancelled) return [];
  const seen = new Set<string>();
  return ((data.hits ?? data.products ?? []) as OffHit[])
    .filter((hit) => typeof hit.nutriments?.["energy-kcal_100g"] === "number" && (hit.product_name_fr || hit.product_name))
    .map((hit) => {
      const name = (hit.product_name_fr || hit.product_name || "").trim();
      const brand = brandOf(hit.brands);
      const packageGrams = parsePackage(hit.quantity);
      return {
        name,
        source: "off" as const,
        ref: hit.code,
        kcal100: Math.round(hit.nutriments!["energy-kcal_100g"]!),
        protein100: hit.nutriments!.proteins_100g ?? null,
        brand: brand || undefined,
        packageGrams,
        ...parsePieces(`${hit.quantity ?? ""} ${name}`, packageGrams),
        liquid: /\d\s*(cl|ml|l)\b/i.test(hit.quantity ?? "") || undefined,
        detail: brand ? `${brand} · Open Food Facts` : "Open Food Facts",
      };
    })
    // Les doublons (même nom, mêmes valeurs) encombrent la liste.
    .filter((item) => {
      const key = `${normalize(item.name)}|${item.kcal100}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Le classement d'Open Food Facts est approximatif (« kinder country » → « GOLOSI » en
    // premier) : on remonte les produits dont le nom et la marque contiennent les mots cherchés.
    .map((item, index) => ({ item, index, score: wordsFound(query, `${item.name} ${item.brand ?? ""}`) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

/** Produit exact à partir de son code-barres (EAN), avec la portion de l'emballage. */
export async function openFoodFactsByBarcode(code: string): Promise<FoodResult | null> {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=product_name,product_name_fr,brands,nutriments,serving_size,serving_quantity,quantity`);
  const product = data.product;
  const kcal = product?.nutriments?.["energy-kcal_100g"];
  if (data.status !== 1 || typeof kcal !== "number") return null;
  const grams = Number(product.serving_quantity);
  const brand = brandOf(product.brands);
  const name = String(product.product_name_fr || product.product_name || "Produit").trim();
  const packageGrams = parsePackage(product.quantity);
  return {
    name,
    source: "off",
    ref: code,
    kcal100: Math.round(kcal),
    protein100: product.nutriments.proteins_100g ?? null,
    portionGrams: grams > 0 ? grams : undefined,
    portionLabel: grams > 0 ? shortServing(String(product.serving_size ?? ""), grams) : undefined,
    // Boisson : contenance en cl / ml sur l'emballage.
    liquid: /\d\s*(cl|ml|l)\b/i.test(String(product.quantity ?? "")) || undefined,
    packageGrams,
    ...parsePieces(`${product.quantity ?? ""} ${name}`, packageGrams),
    brand: brand || undefined,
    detail: brand ? `${brand} · code-barres` : "Code-barres · Open Food Facts",
  };
}

/** Taille d'une portion indiquée sur l'emballage (« 1 barre (23,5 g) »). */
export async function openFoodFactsPortion(code: string) {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=serving_size,serving_quantity`);
  const grams = Number(data.product?.serving_quantity);
  if (!grams || grams <= 0) return null;
  return { grams, label: shortServing(String(data.product?.serving_size ?? ""), grams) };
}

/**
 * Les portions d'Open Food Facts sont du texte libre recopié de l'emballage :
 * « 200 ml (Cette bouteille de 1 L contient 5 portions de 200 ml) » → « 1 portion (200 ml) ».
 */
export function shortServing(text: string, grams: number) {
  const clean = text.replace(/\s*[([].*$/, "").replace(/\s+/g, " ").trim();
  return clean && clean.length <= 18 ? `1 portion (${clean})` : `1 portion (${Math.round(grams)} g)`;
}

// --- Recettes et aliments perso ----------------------------------------------------------

export function searchOwn(query: string, recipes: Recipe[], customFoods: CustomFood[]): FoodResult[] {
  const normalized = normalize(query);
  const matches = (name: string) => !normalized || normalized.split(" ").every((word) => normalize(name).includes(word));
  return [
    ...recipes.filter((recipe) => matches(recipe.name)).map((recipe) => ({
      name: recipe.name,
      source: "recette" as const,
      ref: String(recipe.id),
      // Une recette est connue par portion : on stocke les valeurs d'une portion.
      kcal100: recipe.calories,
      protein100: recipe.protein,
      portionLabel: "1 portion",
      perPortionOnly: true,
      detail: "Ma recette · par portion",
    })),
    ...customFoods.filter((food) => matches(food.name)).map((food) => ({
      name: food.name,
      source: "perso" as const,
      ref: String(food.id),
      kcal100: food.kcal100,
      protein100: food.protein100,
      portionGrams: food.portionGrams,
      portionLabel: food.portionLabel,
      detail: "Mon aliment",
    })),
  ];
}

// --- Calculs ----------------------------------------------------------------------------

/** Grammes réellement mangés (une recette n'a pas de poids : on renvoie null). */
export function itemGrams(item: MealItem) {
  if (item.unit === "g") return item.quantity;
  return item.portionGrams ? item.quantity * item.portionGrams : null;
}

/**
 * Sans poids de portion (recette, repas dont on ne connaît que les calories),
 * les valeurs stockées sont celles d'une portion et non de 100 g.
 */
const perPortion = (item: MealItem) => item.unit === "portion" && !item.portionGrams;

export function itemCalories(item: MealItem) {
  if (perPortion(item)) return item.quantity * item.kcal100;
  return ((itemGrams(item) ?? 0) * item.kcal100) / 100;
}

export function itemProtein(item: MealItem) {
  if (item.protein100 === null) return 0;
  if (perPortion(item)) return item.quantity * item.protein100;
  return ((itemGrams(item) ?? 0) * item.protein100) / 100;
}

/** Aliment prêt à ajouter : une portion si on la connaît, sinon 100 g. */
export function toMealItem(result: FoodResult): MealItem {
  const { source, ref, kcal100, protein100, brand, liquid, packageGrams, pieceGrams, pieceLabel } = result;
  // Sans portion indiquée, un paquet vendu à la pièce se compte en pièces (« 1 tranche »).
  const portionGrams = result.portionGrams ?? pieceGrams;
  const portionLabel = result.portionGrams ? result.portionLabel : pieceLabel ?? result.portionLabel;
  // Un produit de marque garde sa marque : « Banane · Jafaden » n'est pas une banane.
  const name = brand && !normalize(result.name).includes(normalize(brand)) ? `${result.name} · ${brand}` : result.name;
  const byPortion = result.perPortionOnly || !!portionGrams;
  return {
    name, source, ref, kcal100, protein100, portionGrams, portionLabel, liquid, packageGrams, pieceGrams, pieceLabel,
    servingGrams: portionGrams, servingLabel: portionLabel,
    quantity: byPortion ? 1 : 100, unit: byPortion ? "portion" : "g",
  };
}

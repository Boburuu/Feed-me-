// Reconnaissance d'un plat sur une photo, sur le téléphone et hors ligne.
//
// Le modèle (AIY Food V1 de Google, ~2 000 plats) donne des noms de plats en anglais
// avec une probabilité. On les relie aux aliments de la table Ciqual, avec une portion
// habituelle. Le modèle ne voit pas les quantités : l'utilisateur les corrige.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { commonFoods } from "./commonFoods";
import { normalize as simplify, openFoodFactsByBarcode, searchCiqual, searchCommon, searchOpenFoodFacts, type FoodResult } from "./foods";
import { readTextLines } from "./ocr";

type FoodClassifierPlugin = {
  classify(options: { path: string; limit?: number }): Promise<{ results: { label: string; score: number }[] }>;
};
const FoodClassifier = registerPlugin<FoodClassifierPlugin>("FoodClassifier");

export const photoRecognitionAvailable = () => Capacitor.isNativePlatform();

export type PhotoSuggestion = { label: string; score: number; food: FoodResult };

/**
 * Étiquette du modèle → recherche en français. L'ordre compte : la première règle qui
 * correspond l'emporte (« Apple pie » avant « pie »). Sans règle, on cherche le nom tel
 * quel : beaucoup de plats ont le même nom en français (couscous, paella, risotto…).
 */
const rules: [RegExp, string][] = [
  [/pizza/, "pizza"],
  [/burger/, "hamburger"],
  [/hot dog/, "sandwich"],
  [/club sandwich|sandwich|panini|sub\b/, "sandwich"],
  [/potato salad/, "salade de pomme de terre"],
  [/caesar salad/, "salade cesar"],
  [/pasta salad/, "salade composee"],
  [/salad/, "salade composee"],
  [/ramen|noodle soup|pho\b/, "ramen"],
  [/miso soup/, "soupe"],
  [/onion soup/, "soupe a l'oignon"],
  [/soup|bisque|chowder|velout/, "soupe"],
  [/noodle|chow mein|pad thai|lo mein/, "nouilles"],
  [/fried rice/, "riz cantonais"],
  [/rice pudding/, "riz au lait"],
  [/rice/, "riz"],
  [/carbonara/, "carbonara"],
  [/bolognese|spaghetti/, "pates bolognaise"],
  [/lasagn/, "lasagnes"],
  [/macaroni|mac and cheese/, "gratin de pates"],
  [/ravioli|tortellini/, "raviolis"],
  [/gnocchi/, "gnocchi"],
  [/pasta|penne|tagliatelle|fettuccine/, "pates"],
  [/sushi|maki|sashimi|poke/, "sushi"],
  [/curry/, "curry"],
  [/fried chicken|chicken nugget|nugget/, "nuggets"],
  [/roast chicken|chicken/, "poulet"],
  [/beef bourguignon|bourguignon/, "boeuf bourguignon"],
  [/steak tartare|tartare/, "tartare"],
  [/steak|beef/, "steak"],
  [/moules|mussel/, "moules"],
  [/fish and chips|fried fish|fish finger/, "poisson pane"],
  [/salmon/, "saumon"],
  [/tuna/, "thon"],
  [/shrimp|prawn/, "crevette"],
  [/fish/, "cabillaud"],
  [/sausage|bratwurst|hot link/, "saucisse"],
  [/omelet/, "omelette"],
  [/eggs? benedict|scrambled|fried egg|deviled egg|egg/, "oeuf"],
  [/french fries|cheese fries|home fries|fries/, "frites"],
  [/mashed potato/, "puree"],
  [/potato/, "pommes de terre"],
  [/apple pie|tarte tatin|apple crisp|apple strudel/, "tarte aux pommes"],
  [/cheesecake/, "cheesecake"],
  [/brownie/, "brownie"],
  [/chocolate cake|lava cake|fondant/, "gateau au chocolat"],
  [/cake|muffin|cupcake/, "gateau"],
  [/pie|tart\b|tarte/, "tarte"],
  [/pancake/, "crepe"],
  [/cr[eê]pe/, "crepe"],
  [/waffle/, "gaufre"],
  [/cookie|biscuit/, "cookie"],
  [/ice cream|gelato|sundae|banana split/, "glace"],
  [/donut|doughnut/, "beignet"],
  [/pain au chocolat/, "pain au chocolat"],
  [/croissant|pastry|viennoiserie|danish/, "croissant"],
  [/bread|baguette|toast/, "pain"],
  [/taco|burrito|nachos|quesadilla|enchilada/, "burritos"],
  [/falafel/, "falafel"],
  [/hummus/, "houmous"],
  [/dumpling|gyoza|bao/, "raviolis"],
  [/kebab|gyro|shawarma/, "kebab"],
  [/muesli|granola|porridge|oatmeal/, "muesli"],
  [/yogh?urt/, "yaourt"],
];

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function frenchQuery(label: string) {
  const key = normalize(label);
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? key;
}

/**
 * Réduit la photo et l'écrit dans le cache de l'app, où le module natif la lit. On garde
 * 2048 px : en dessous, le code-barres d'une photo prise de loin devient illisible.
 */
async function writePhoto(file: File) {
  const { Directory, Filesystem } = await import("@capacitor/filesystem");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = url;
    });
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const path = `repas-${Date.now()}.jpg`;
    const { uri } = await Filesystem.writeFile({ path, data: canvas.toDataURL("image/jpeg", 0.9).split(",")[1], directory: Directory.Cache });
    return { uri, remove: () => Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Plats probables d'après le modèle, regroupés par aliment Ciqual (probabilités additionnées). */
async function classifyDish(uri: string, limit: number): Promise<PhotoSuggestion[]> {
  const { results } = await FoodClassifier.classify({ path: uri, limit: 10 });
  const byFood = new Map<string, PhotoSuggestion>();
  for (const { label, score } of results) {
    if (score < 0.02) continue;
    const query = frenchQuery(label);
    const food = (await searchCommon(query, 1))[0] ?? (await searchCiqual(query, 1))[0];
    if (!food) continue;
    const key = food.ref ?? food.name;
    const existing = byFood.get(key);
    if (existing) existing.score += score;
    else byFood.set(key, { label, score, food });
  }
  // En dessous de 15 %, le modèle devine : mieux vaut ne rien proposer.
  return [...byFood.values()].filter((item) => item.score >= 0.15).sort((a, b) => b.score - a.score).slice(0, limit);
}

const barcodeFormats = ["EAN_13", "EAN_8", "UPC_A", "UPC_E"];

async function barcodeProduct(uri: string) {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const { barcodes } = await BarcodeScanner.readBarcodesFromImage({ path: uri, formats: barcodeFormats as never });
  const code = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
  return code ? openFoodFactsByBarcode(code) : null;
}

/** Mots imprimés sur un emballage qui ne désignent pas le produit. */
const packagingNoise = /^(net|poids|ingredients?|nutri|score|valeurs?|energie|kcal|kj|pour|par|portion|sans|avec|nouveau|new|recette|offre|lot|x\d+|\d+.*)$/i;

/**
 * Nom du produit lu sur l'emballage : les lignes écrites le plus gros (« kinder »,
 * « Country »), puis recherche dans Open Food Facts.
 */
async function packagingProducts(uri: string): Promise<FoodResult[]> {
  const read = await readTextLines(uri);
  // Nom d'un aliment courant écrit sur l'emballage (« Monster … Ultra Rosá ») : fiable,
  // et disponible hors ligne. Le nom le plus long l'emporte (« ultra rosa » avant « monster »).
  const known = commonInText(read.map((line) => line.text).join(" "));
  const common = known ? await searchCommon(known, 1) : [];
  if (!navigator.onLine) return common;
  const lines = read
    .map((line) => ({ ...line, text: line.text.replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text.length >= 3 && /\p{L}{3}/u.test(line.text))
    .sort((a, b) => b.height - a.height);
  // Seul le gros texte compte : « kinder Country », pas « Retrouvez des bons plans… ».
  const big = lines.filter((line) => line.height >= (lines[0]?.height ?? 0) * 0.6).slice(0, 2);
  const words = big.flatMap((line) => line.text.split(" ")).filter((word) => word.length >= 2 && !packagingNoise.test(word));
  const query = [...new Set(words.map((word) => word.toLowerCase()))].slice(0, 4).join(" ");
  const brands = query.length < 3 ? [] : await searchOpenFoodFacts(query).catch(() => []);
  return [...common, ...brands.slice(0, 3)];
}

/** Une lettre de différence au plus (« utra » ≈ « ultra », « monstar » ≈ « monster »). */
function nearlyEqual(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  // Après la première différence : lettre remplacée, en trop ou manquante.
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

/** Un mot lu correspond au mot cherché, malgré une lettre mal lue ou des mots collés (« monsterenergy »). */
const wordMatches = (read: string, wanted: string) => nearlyEqual(read, wanted) || (wanted.length >= 6 && read.startsWith(wanted));

/**
 * Aliment courant dont le nom (ou un synonyme) est écrit sur l'emballage. La lecture des
 * logos est approximative (« MNSTER », « Utra Rosá ») : une lettre de différence est
 * tolérée. Le nom le plus long l'emporte (« ultra rosa » avant « monster »).
 */
function commonInText(text: string) {
  const read = simplify(text).split(" ");
  let best = { name: "", length: 0 };
  for (const food of commonFoods) {
    for (const name of [food.name, ...(food.aliases ?? [])].map(simplify)) {
      if (name.length < 5 || name.length <= best.length) continue;
      const wanted = name.split(" ");
      const found = read.some((_, start) => wanted.every((word, offset) => read[start + offset] !== undefined && wordMatches(read[start + offset], word)));
      if (found) best = { name: food.name, length: name.length };
    }
  }
  return best.name;
}

export type PhotoAnalysis = {
  /** Produit exact trouvé par le code-barres visible sur la photo. */
  barcode: FoodResult | null;
  /** Produits trouvés d'après le nom écrit sur l'emballage. */
  packaging: FoodResult[];
  /** Plats probables (modèle de reconnaissance d'images). */
  dishes: PhotoSuggestion[];
};

/**
 * Analyse une photo, de la méthode la plus fiable à la moins fiable :
 * code-barres → nom imprimé sur l'emballage → reconnaissance du plat.
 */
export async function analyzeMealPhoto(file: File): Promise<PhotoAnalysis> {
  const { uri, remove } = await writePhoto(file);
  try {
    const barcode = await barcodeProduct(uri).catch(() => null);
    if (barcode) return { barcode, packaging: [], dishes: [] };
    const [packaging, dishes] = await Promise.all([
      packagingProducts(uri).catch(() => []),
      classifyDish(uri, 3).catch(() => []),
    ]);
    return { barcode: null, packaging, dishes };
  } finally {
    remove();
  }
}

export type ScanResult = { status: "found"; food: FoodResult } | { status: "unknown"; code: string } | { status: "cancelled" | "installing" };

/** Scanner de codes-barres de Google (caméra en direct), puis produit Open Food Facts. */
export async function scanBarcode(): Promise<ScanResult> {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    // Premier usage : Android télécharge le scanner (quelques secondes).
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    return { status: "installing" };
  }
  const { barcodes } = await BarcodeScanner.scan({ formats: barcodeFormats as never });
  const code = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
  if (!code) return { status: "cancelled" };
  const food = await openFoodFactsByBarcode(code);
  return food ? { status: "found", food } : { status: "unknown", code };
}

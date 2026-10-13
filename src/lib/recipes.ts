// Catégories de recettes, lecture et affichage des ingrédients.

import type { IconName } from "../components/Icon";
import type { FoodResult } from "./foods";
import type { Ingredient, IngredientNutrition, Recipe, RecipeCategory } from "./storage";

export const recipeCategories: { id: RecipeCategory; label: string; plural: string; icon: IconName }[] = [
  { id: "petit-dejeuner", label: "Petit-déjeuner", plural: "Petits-déj", icon: "clock" },
  { id: "apero", label: "Apéro", plural: "Apéros", icon: "users" },
  { id: "entree", label: "Entrée", plural: "Entrées", icon: "apple" },
  { id: "plat", label: "Plat", plural: "Plats", icon: "flame" },
  { id: "dessert", label: "Dessert", plural: "Desserts", icon: "target" },
  { id: "gouter", label: "Goûter / en-cas", plural: "Goûters", icon: "apple" },
  { id: "boisson", label: "Boisson", plural: "Boissons", icon: "water" },
];

export const categoryOf = (recipe: Recipe): RecipeCategory => recipe.category ?? "plat";
export const categoryLabel = (id: RecipeCategory) => recipeCategories.find((item) => item.id === id)?.label ?? "Plat";

/** Devine la catégorie à partir d'un titre ou d'un texte (« Apéritif », « Tarte au citron »…). */
export function guessCategory(text: string): RecipeCategory | null {
  const value = text.toLowerCase();
  if (/ap[ée]r(o|itif)|amuse|tapas|cocktail d[îi]natoire/.test(value)) return "apero";
  if (/boisson|cocktail|smoothie|\bjus\b|milkshake|mocktail|limonade/.test(value)) return "boisson";
  if (/petit[- ]d[ée]j|brunch|breakfast|porridge|granola|pancake/.test(value)) return "petit-dejeuner";
  if (/dessert|g[âa]teau|tarte (au|aux) (citron|pomme|fraise|chocolat|poire)|p[âa]tisserie|\bcake\b|cookie|brownie|tiramisu|mousse au chocolat|cheesecake/.test(value)) return "dessert";
  if (/go[ûu]ter|en-cas|snack|collation/.test(value)) return "gouter";
  if (/entr[ée]e|starter|velout[ée]|soupe|gaspacho/.test(value)) return "entree";
  if (/plat|main|d[îi]ner|d[ée]jeuner/.test(value)) return "plat";
  return null;
}

/** Ancien format : une ligne par ingrédient, ou tout sur une ligne séparé par des virgules. */
export function ingredientLines(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length === 1 ? lines[0].split(",").map((line) => line.trim()).filter(Boolean) : lines;
}

// --- Unités -------------------------------------------------------------------------

/** Unité affichée et façons courantes de l'écrire (y compris abréviations d'Instagram). */
const unitAliases: { unit: string; pattern: string }[] = [
  { unit: "kg", pattern: "kg|kilos?|kilogrammes?" },
  { unit: "mg", pattern: "mg" },
  { unit: "g", pattern: "g|gr|grs|grammes?" },
  { unit: "cl", pattern: "cl|centilitres?" },
  { unit: "ml", pattern: "ml|millilitres?" },
  { unit: "dl", pattern: "dl" },
  { unit: "L", pattern: "l|litres?" },
  { unit: "c. à soupe", pattern: "c\\.?\\s?[àa]\\.?\\s?s\\.?|cas|cs|cuill?(?:[èe]re)?s?\\.?\\s?[àa]\\s?soupe|c\\.?\\s?[àa]\\s?soupe|tbsp|cuill?[èe]res? soupe" },
  { unit: "c. à café", pattern: "c\\.?\\s?[àa]\\.?\\s?c\\.?|cac|cc|cuill?(?:[èe]re)?s?\\.?\\s?[àa]\\s?caf[ée]|c\\.?\\s?[àa]\\s?caf[ée]|tsp|cuill?[èe]res? caf[ée]" },
  { unit: "pincée", pattern: "pinc[ée]es?" },
  { unit: "sachet", pattern: "sachets?" },
  { unit: "boîte", pattern: "bo[îi]tes?" },
  { unit: "tranche", pattern: "tranches?" },
  { unit: "gousse", pattern: "gousses?" },
  { unit: "verre", pattern: "verres?" },
  { unit: "tasse", pattern: "tasses?|cups?" },
  { unit: "pot", pattern: "pots?" },
  { unit: "poignée", pattern: "poign[ée]es?" },
  { unit: "botte", pattern: "bottes?" },
  { unit: "brin", pattern: "brins?" },
  { unit: "feuille", pattern: "feuilles?" },
  { unit: "noix", pattern: "noix(?= de)" },
];

/** Unités proposées dans le formulaire. */
export const commonUnits = ["g", "kg", "ml", "cl", "L", "c. à soupe", "c. à café", "pincée", "sachet", "boîte", "tranche", "gousse", "pot", "poignée", "brin"];

const unitPattern = unitAliases.map((item) => item.pattern).join("|");
const quantityPattern = "\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?(?:\\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔]";
// Fin d'unité : \b ne marche pas après une lettre accentuée (« café »), d'où cette anticipation.
const unitEnd = "(?=[\\s.,:;)]|$)";
const leading = new RegExp(`^(${quantityPattern})(?:\\s*(?:à|-|–)\\s*(?:${quantityPattern}))?\\s*(?:(${unitPattern})${unitEnd}\\.?)?\\s*(?:de\\s+|d['’]\\s*)?(.*)$`, "i");
const trailing = new RegExp(`^(.*?)[\\s:–-]+(${quantityPattern})\\s*(?:(${unitPattern})${unitEnd}\\.?)?\\s*$`, "i");

const fractions: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

export function parseQuantity(text: string): number | null {
  const value = text.trim();
  if (fractions[value]) return fractions[value];
  const mixed = value.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (mixed) return Number(mixed[1]) + fractions[mixed[2]];
  const [a, b] = value.split("/").map((part) => Number(part.trim().replace(",", ".")));
  const result = b ? a / b : a;
  return Number.isFinite(result) && result > 0 ? result : null;
}

function canonicalUnit(raw: string | undefined) {
  if (!raw) return "";
  const lower = raw.toLowerCase().replace(/\.$/, "");
  return unitAliases.find((item) => new RegExp(`^(?:${item.pattern})$`, "i").test(lower))?.unit ?? raw;
}

/** « 200 g de farine », « Farine : 200g », « ½ citron », « Sel, poivre ». */
export function parseIngredientLine(text: string): Ingredient {
  const line = text.replace(/^[\s•·*▪︎◦–-]+/, "").replace(/\s+/g, " ").trim();
  const start = line.match(leading);
  if (start && start[3]) {
    return { quantity: parseQuantity(start[1]), unit: canonicalUnit(start[2]), name: start[3].trim() };
  }
  const end = line.match(trailing);
  if (end && end[1] && /[a-zà-ÿ]/i.test(end[1])) {
    // « Farine : 200 g » → nom en minuscule pour lire « 200 g de farine » (sauf sigle : « SIRUP »).
    const name = end[1].replace(/[:–-]\s*$/, "").trim();
    return { quantity: parseQuantity(end[2]), unit: canonicalUnit(end[3]), name: /^[A-ZÀ-Ý][a-zà-ÿ]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name };
  }
  return { quantity: null, unit: "", name: line };
}

export function formatQuantity(value: number) {
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 100) / 100;
  const nice: Record<string, string> = { "0.5": "½", "0.25": "¼", "0.75": "¾", "0.33": "⅓", "0.67": "⅔" };
  return nice[String(rounded)] ?? rounded.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

const vowel = /^[aeiouyhâàéèêëîïôöûüœ]/i;
const countableUnits = new Set(["pincée", "sachet", "boîte", "tranche", "gousse", "verre", "tasse", "pot", "poignée", "botte", "brin", "feuille"]);

/** « 300 g de farine » pour { 200, g, farine } × 1,5. */
export function formatIngredient(item: Ingredient, factor = 1) {
  let value = item.quantity === null ? null : item.quantity * factor;
  let approx = "";
  // Ce qui se compte (œufs, citrons, gousses…) : pas de « 1,17 œuf ». Arrondi au demi
  // en dessous de 3, à l'unité au-delà.
  if (value !== null && factor !== 1 && (!item.unit || countableUnits.has(item.unit))) {
    const rounded = value < 3 ? Math.max(0.5, Math.round(value * 2) / 2) : Math.round(value);
    if (Math.abs(rounded - value) > 0.01) approx = "≈ ";
    value = rounded;
  }
  const quantity = value === null ? "" : approx + formatQuantity(value);
  if (!quantity) return item.name;
  if (!item.unit) return `${quantity} ${item.name}`;
  const linker = /^(de |d['’]|du |des )/i.test(item.name) ? "" : vowel.test(item.name) ? "d'" : "de ";
  // « 2 gousses », mais « 2 g » et « 2 c. à soupe » restent invariables.
  const unit = value !== null && value > 1 && countableUnits.has(item.unit) ? `${item.unit}s` : item.unit;
  return `${quantity} ${unit} ${linker}${item.name}`;
}

// --- Valeurs nutritionnelles -------------------------------------------------------------

const simple = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Grammes par unité de mesure (1 ml ≈ 1 g ; cuillères rases, moyennes usuelles). */
const unitWeights: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, L: 1000, "c. à soupe": 15, "c. à café": 5 };

/** Poids de l'ingrédient, quand on peut le déduire de sa quantité ; null sinon. */
export function ingredientGrams(item: Ingredient): number | null {
  if (item.quantity === null) return null;
  const weight = unitWeights[item.unit];
  if (weight) return item.quantity * weight;
  const piece = item.nutrition?.unitGrams;
  if (!piece) return null;
  // « 4 feuilles » pour une feuille de 9 g ; « 2 » (sans unité) pour 2 œufs.
  const unit = simple(item.unit);
  const label = simple(item.nutrition?.unitLabel ?? "");
  return (label ? unit.startsWith(label) : !unit) ? item.quantity * piece : null;
}

/** Calories et protéines de la recette entière, d'après les ingrédients dont on connaît les valeurs. */
export function ingredientsNutrition(items: Ingredient[]) {
  let kcal = 0;
  let protein = 0;
  let known = 0;
  for (const item of items) {
    const grams = ingredientGrams(item);
    if (!item.nutrition || grams === null) continue;
    kcal += (grams * item.nutrition.kcal100) / 100;
    protein += (grams * (item.nutrition.protein100 ?? 0)) / 100;
    known += 1;
  }
  return { kcal, protein, known };
}

/**
 * Ingrédient tiré d'un aliment trouvé : la pièce s'il se compte (« 1 feuille de riz »,
 * « 1 œuf »), la boîte entière s'il est en conserve, sinon 100 g.
 */
export function ingredientFromFood(food: FoodResult): Ingredient {
  const name = food.brand && !simple(food.name).includes(simple(food.brand)) ? `${food.name} · ${food.brand}` : food.name;
  const pieceGrams = food.pieceGrams ?? food.portionGrams;
  const pieceLabel = (food.pieceGrams ? food.pieceLabel : food.portionLabel)?.replace(/^1\s+/, "").replace(/\s*\(.*$/, "") ?? "";
  // Une portion vague (« portion », « assiette ») ne sert pas à compter un ingrédient.
  const countable = !!pieceGrams && !!pieceLabel && !/^(portion|assiette|bol|part|verre|tasse|canette)/.test(simple(pieceLabel)) && !food.perPortionOnly;
  // « 1 œuf », « 1 banane » : la pièce porte le nom de l'aliment, on ne répète pas l'unité.
  const sameAsName = countable && simple(name).startsWith(simple(pieceLabel).slice(0, 4));
  const nutrition: IngredientNutrition = {
    kcal100: food.kcal100,
    protein100: food.protein100,
    source: food.source,
    ref: food.ref,
    ...(countable ? { unitGrams: pieceGrams, unitLabel: sameAsName ? "" : pieceLabel } : {}),
  };
  if (countable) return { name, quantity: 1, unit: sameAsName ? "" : pieceLabel, nutrition };
  if (food.packageGrams) return { name, quantity: food.packageGrams, unit: food.liquid ? "ml" : "g", nutrition };
  return { name, quantity: 100, unit: food.liquid ? "ml" : "g", nutrition };
}

export const allIngredients = (recipe: Recipe) => recipe.ingredients.flatMap((group) => group.items);
export const allSteps = (recipe: Recipe) => recipe.steps.flatMap((group) => group.steps);

/** Liste courte pour les cartes : « poulet · quinoa · avocat ». */
export const ingredientSummary = (recipe: Recipe) => allIngredients(recipe).map((item) => item.name).join(" · ");

// Retrouve dans les bases un ingrédient écrit en texte (« 2 tranches de filet de bacon
// fumé Monique Ranou », « 1 c.c. de ketchup Heinz Zero ») pour calculer la recette.
//
// On cherche le plus long morceau du nom qui désigne un aliment connu : d'abord parmi les
// aliments courants (noms simples, synonymes), puis dans Ciqual. Les marques et
// précisions (« Lidl », « (22 cm) ») sont ignorées. L'utilisateur voit chaque aliment
// retenu et peut le corriger.

import { commonFoods } from "./commonFoods";
import { normalize, searchCiqual, searchCommon, toMealItem, type FoodResult } from "./foods";
import type { Ingredient, MealItem } from "./storage";

const stopWords = new Set(["de", "d", "du", "des", "la", "le", "les", "l", "a", "au", "aux", "en", "et", "ou", "avec", "pour", "sans"]);

/** Morceaux de plusieurs mots consécutifs, du plus long au plus court. */
function windows(words: string[]) {
  const list: string[] = [];
  for (let size = words.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const part = words.slice(start, start + size);
      if (stopWords.has(part[0]) || stopWords.has(part.at(-1)!)) continue;
      list.push(part.join(" "));
    }
  }
  return list;
}

const singular = (text: string) => text.split(" ").map((word) => (word.length > 3 ? word.replace(/[sx]$/, "") : word)).join(" ");

/** Nom simple ou synonyme d'un aliment courant, exactement (au pluriel près). */
function exactCommon(text: string) {
  const key = singular(text);
  return commonFoods.find((food) => [food.name, ...(food.aliases ?? [])].some((name) => singular(normalize(name)) === key));
}

export async function findFood(name: string): Promise<FoodResult | null> {
  // « 12 crevettes ou poulet ou tofu » : on compte le premier choix proposé.
  const firstChoice = name.replace(/\([^)]*\)/g, " ").split(/\s+ou\s+/i)[0];
  const cleaned = normalize(firstChoice.replace(/%/g, " "));
  const words = cleaned.split(" ").filter(Boolean);
  const parts = windows(words);
  // Le morceau le plus long l'emporte, quelle que soit la base : « jus de citron vert » (Ciqual)
  // passe avant « jus » (aliment courant : jus d'orange). À longueur égale, l'aliment courant d'abord.
  for (let size = words.length; size >= 1; size -= 1) {
    const sameSize = parts.filter((part) => part.split(" ").length === size);
    for (const part of sameSize) {
      const food = exactCommon(part);
      if (food) return (await searchCommon(food.name, 1))[0] ?? null;
    }
    // Ciqual : l'aliment doit commencer par le morceau cherché (« Cornichon, au vinaigre » pour
    // « cornichons »), pour éviter « filet » → un filet de poisson.
    for (const part of sameSize) {
      for (const query of new Set([part, singular(part)])) {
        if (query.length < 3) continue;
        const [found] = await searchCiqual(query, 1);
        if (found && normalize(found.name).startsWith(query.split(" ")[0])) return found;
      }
    }
  }
  return null;
}

/**
 * Dans une recette, riz, pâtes, quinoa, semoule ou lentilles se pèsent crus : 120 g de
 * quinoa cru donnent environ 3 fois plus de glucides que 120 g de quinoa cuit. On garde
 * la version cuite seulement si la recette l'écrit (« riz cuit »).
 */
async function rawIfCooked(found: FoodResult, written: string) {
  const name = normalize(found.name);
  if (!/\bcuit/.test(name) || /\bcuit/.test(normalize(written))) return found;
  const base = name.split(" ")[0];
  const [raw] = await searchCiqual(`${base} cru`, 1);
  return raw && normalize(raw.name).startsWith(base) && /\bcru/.test(normalize(raw.name)) ? raw : found;
}

/** Grammes par unité de poids ou de volume (1 ml ≈ 1 g). */
const metric: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, L: 1000 };
/** Mesures de cuisine (cuillères rases) : gardées telles quelles, avec leur poids. */
const measures: Record<string, number> = { "c. à soupe": 15, "c. à café": 5, pincée: 0.5 };

/**
 * Ingrédient écrit → aliment réglable comme dans un repas, avec la même quantité.
 * Null si l'aliment n'est pas trouvé ou si la quantité ne se convertit pas.
 */
export async function matchIngredient(item: Ingredient): Promise<MealItem | null> {
  if (item.quantity === null || !item.name.trim()) return null;
  // « 2 feuilles de riz » est lu « feuille » + « riz » : on cherche d'abord avec l'unité.
  const withUnit = item.unit && !metric[item.unit] && !measures[item.unit] ? await findFood(`${item.unit} de ${item.name}`) : null;
  const matched = withUnit ?? (await findFood(item.name));
  if (!matched) return null;
  const found = await rawIfCooked(matched, item.name);
  // Le nom écrit reste (marque, précision) ; l'aliment retenu est affiché à côté pour vérifier.
  // « feuille » + « riz J.B » : l'unité fait partie du nom de l'aliment (« Feuille de riz J.B »).
  const unitInName = !!withUnit && normalize(found.name).startsWith(normalize(item.unit));
  const name = unitInName ? `${item.unit.charAt(0).toUpperCase()}${item.unit.slice(1)} de ${item.name}` : item.name;
  const food: MealItem = { ...toMealItem(found), name, matchedName: found.name };
  const grams = metric[item.unit];
  if (grams) return { ...food, unit: "g", quantity: Math.round(item.quantity * grams * 10) / 10, ...(["ml", "cl", "dl", "L"].includes(item.unit) ? { liquid: true } : {}) };
  // « 1 c. à café », « 2 tranches », « 1 œuf » : la mesure écrite, ou la pièce habituelle de l'aliment.
  const pieceGrams = measures[item.unit] ?? found.portionGrams;
  if (!pieceGrams) return null;
  const label = item.unit && !unitInName ? `1 ${item.unit}` : found.portionLabel;
  return { ...food, unit: "portion", quantity: item.quantity, portionGrams: pieceGrams, portionLabel: label, servingGrams: pieceGrams, servingLabel: label };
}

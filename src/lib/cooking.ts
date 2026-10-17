// Cru ou cuit (cahier v2 § 7).
//
// - Viandes, poissons, œufs : Ciqual donne une fiche crue ET des fiches cuites (grillé,
//   rôti, vapeur…). Pesé cuit, on prend la fiche cuite : aucune conversion approximative
//   (le gras fond, l'eau s'évapore — un facteur unique serait faux pour une entrecôte).
// - Féculents vendus secs : facteur sec → cuit (dryGoods.ts), ou celui de l'emballage
//   quand il donne aussi les valeurs « préparé ».
// - Le choix (cru / cuit, sec / cuit) est retenu par aliment et reproposé la fois suivante.

import { loadCiqual, normalize, type CiqualRow } from "./foods";
import type { MealItem } from "./storage";

const RAW = /\bcru(e|s|es)?\b/;
const COOKED = /\b(cuit|cuite|cuits|cuites|grille|grillee|grilles|grillees|roti|rotie|rotis|roties|poele|poelee|a la vapeur|vapeur|braise|braisee|bouilli|bouillie|au four|sautee?|a l etouffee|poche|pochee|dur|a la coque|au plat|brouille)\b/;
/** Variantes de filière (« bio », « label rouge ») : même aliment, elles encombrent le choix. */
const LABEL = /\b(bio|label rouge|elevage|sauvage)\b/;
/** Préparations à part entière, pas une simple cuisson. */
const NOT_A_COOKING = /\b(pane|panee|sauce|friture|frit|frite|enrobe|appertise|fume|fumee|marine|surimi|nuggets|cordon|farci|en conserve)\b/;

/** Partie commune du nom : « Poulet, filet, sans peau, cru » → « poulet filet sans peau ». */
export function cookingBase(name: string) {
  const simple = normalize(name);
  const cut = simple.search(new RegExp(`${RAW.source}|${COOKED.source}`));
  return (cut > 0 ? simple.slice(0, cut) : simple).replace(/\b(sans precision|aliment moyen)\b/g, "").replace(/\s+/g, " ").trim();
}

/** Mode de cuisson lisible : « cru », « grillé/poêlé », « rôti/cuit au four »… */
export function cookingLabel(name: string) {
  const parts = name.split(",").map((part) => part.trim());
  const index = parts.findIndex((part) => RAW.test(normalize(part)) || COOKED.test(normalize(part)));
  if (index < 0) return null;
  return parts.slice(index).join(", ").replace(/\s*\((aliment moyen|sans précision)\)/gi, "").replace(/, sans précision/gi, "").trim();
}

export type CookingVariant = { ref: string; name: string; label: string; raw: boolean; kcal100: number; protein100: number | null; carbs100: number | null; fat100: number | null };

const toVariant = ([code, name, kcal, protein, carbs, fat]: CiqualRow): CookingVariant => ({
  ref: String(code), name, label: cookingLabel(name) ?? name, raw: RAW.test(normalize(name)), kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat,
});

/** Fiches crue et cuites du même aliment Ciqual (au moins une de chaque), sinon []. */
export function variantsIn(rows: CiqualRow[], item: Pick<MealItem, "source" | "name">): CookingVariant[] {
  if (item.source !== "ciqual") return [];
  const simple = normalize(item.name);
  if (!RAW.test(simple) && !COOKED.test(simple)) return [];
  if (NOT_A_COOKING.test(simple)) return [];
  const base = cookingBase(item.name);
  if (base.length < 4) return [];
  const variants = rows
    .filter((row) => {
      const name = normalize(row[1]);
      if (cookingBase(row[1]) !== base || !(RAW.test(name) || COOKED.test(name)) || NOT_A_COOKING.test(name)) return false;
      // L'aliment choisi reste toujours proposé ; ses variantes de filière non.
      return row[1] === item.name || !LABEL.test(name);
    })
    .map(toVariant);
  return variants.some((variant) => variant.raw) && variants.some((variant) => !variant.raw) ? variants.sort((a, b) => Number(b.raw) - Number(a.raw)) : [];
}

export async function cookingVariants(item: Pick<MealItem, "source" | "name">) {
  if (item.source !== "ciqual") return [];
  return variantsIn((await loadCiqual()).rows, item);
}

/** Aliment basculé sur une autre fiche (crue ↔ cuite), même quantité. */
export function withVariant(item: MealItem, variant: CookingVariant): Partial<MealItem> {
  return { name: variant.name, ref: variant.ref, kcal100: variant.kcal100, protein100: variant.protein100, carbs100: variant.carbs100, fat100: variant.fat100, refKcal100: undefined, refName: undefined };
}

// --- Choix retenu par aliment ------------------------------------------------------------------

/** Clé de l'aliment pour retenir le choix : l'aliment sans son mode de cuisson. */
export function cookKey(item: Pick<MealItem, "source" | "ref" | "name">) {
  return item.source === "ciqual" ? `ciqual:${cookingBase(item.name)}` : `${item.source}:${item.ref ?? normalize(item.name)}`;
}

/** portionGrams : poids d'une portion indiqué par l'utilisateur (cookie Subway pesé : 45 g). */
export type CookPref = { weighedCooked?: boolean; variantRef?: string; portionGrams?: number };
export type CookPrefs = Record<string, CookPref>;

// --- Matière grasse de cuisson ---------------------------------------------------------------

const COOKED_IN_FAT = /\b(grille|grillee|poele|poelee|saute|sautee|sautes|rissole|revenu|plancha)\b/;
const NEEDS_FAT = /\b(viande|boeuf|steak|poulet|dinde|porc|veau|agneau|canard|escalope|filet|cote|saumon|cabillaud|colin|lieu|poisson|crevettes?|oeufs?|omelette|legumes|champignons|courgettes?|aubergines?|poivrons?|pommes? de terre)\b/;
const IS_FAT = /\b(huile|beurre|margarine|graisse|saindoux|matiere grasse|creme)\b/;

/** Le repas contient un aliment poêlé, ou une viande / un poisson / des légumes crus à cuire, sans matière grasse notée. */
export function suggestCookingFat(items: Pick<MealItem, "name">[]) {
  const names = items.map((item) => normalize(item.name));
  if (names.some((name) => IS_FAT.test(name))) return false;
  return names.some((name) => COOKED_IN_FAT.test(name) || (RAW.test(name) && NEEDS_FAT.test(name)));
}

// « Mes ingrédients » : produits gardés pour les retrouver vite (jambon Herta scanné, avec sa
// photo et la taille d'une tranche), réutilisables dans un repas, une assiette ou une recette.

import type { FoodResult } from "./foods";
import type { MealItem } from "./storage";

export type PantryItem = MealItem & { pantryId: number; addedAt: string };

/** Champs propres à un repas (quantité mangée, réglages de recette) retirés de l'ingrédient gardé. */
export function toPantry(item: MealItem, id = Date.now(), today = new Date().toISOString().slice(0, 10)): PantryItem {
  const { recipeCount: _count, hydrates: _hydrates, waterMl: _water, choice: _choice, ...rest } = item;
  const byPortion = !!(rest.portionGrams ?? rest.pieceGrams);
  return { ...rest, unit: byPortion ? "portion" : "g", quantity: byPortion ? 1 : 100, pantryId: id, addedAt: today };
}

/** L'ingrédient gardé, présenté comme un résultat de recherche (même ligne que partout ailleurs). */
export function pantryResult(item: PantryItem): FoodResult {
  const { pantryId: _id, addedAt: _added, quantity: _quantity, unit: _unit, ...rest } = item;
  // La taille de la pièce s'affiche déjà avec la ligne (« 1 tranche ≈ 40 g ») : ici, le paquet.
  return { ...rest, detail: ["Mes ingrédients", item.packageGrams ? `paquet de ${Math.round(item.packageGrams)} g` : ""].filter(Boolean).join(" · ") };
}

/**
 * Taille d'une pièce donnée à la main : « 1 tranche = 40 g », ou « paquet de 4 tranches,
 * 160 g » (la tranche est alors calculée). L'ingrédient se compte ensuite à la tranche.
 */
export function withPieceSize(item: PantryItem, size: { label: string; grams?: number; count?: number; packageGrams?: number }): PantryItem {
  const packageGrams = size.packageGrams ?? item.packageGrams;
  const grams = size.grams ?? (size.count && packageGrams ? packageGrams / size.count : undefined);
  if (!grams || grams <= 0) return item;
  const label = `1 ${size.label.trim().replace(/^1\s+/, "") || "pièce"}`;
  const pieceGrams = Math.round(grams * 10) / 10;
  return {
    ...item,
    pieceGrams, pieceLabel: label,
    portionGrams: pieceGrams, portionLabel: label,
    servingGrams: pieceGrams, servingLabel: label,
    ...(packageGrams ? { packageGrams } : {}),
    unit: "portion", quantity: 1,
  };
}

/** « 1 boîte » : le libellé que la ligne d'aliment reconnaît comme paquet entier (½, ¼…). */
export const PACKAGE_LABEL = "1 boîte";

/** Sachet ou paquet (mozzarella râpée 150 g) : compté au sachet entier ou en fractions (½, ¼). */
export function withPackage(item: PantryItem, grams: number): PantryItem {
  if (!(grams > 0)) return item;
  const { pieceGrams: _pg, pieceLabel: _pl, servingGrams: _sg, servingLabel: _sl, ...rest } = item;
  return { ...rest, packageGrams: grams, portionGrams: grams, portionLabel: PACKAGE_LABEL, unit: "portion", quantity: 1 };
}

/** Compté seulement en grammes : plus de pièce ni de portion par défaut. */
export function gramsOnly(item: PantryItem): PantryItem {
  const { pieceGrams: _pg, pieceLabel: _pl, portionGrams: _po, portionLabel: _pol, servingGrams: _sg, servingLabel: _sl, ...rest } = item;
  return { ...rest, unit: "g", quantity: 100 };
}

/** Façon d'utiliser l'ingrédient, d'après ce qui est réglé. */
export const pantryMode = (item: PantryItem): "grams" | "piece" | "package" =>
  item.portionLabel === PACKAGE_LABEL && item.packageGrams ? "package" : item.pieceGrams ? "piece" : "grams";

// Valeurs à vérifier : une fiche Open Food Facts peut être fausse ou concerner une autre
// version du produit (pavés de saumon à 269 kcal/100 g). On le signale sans jamais rien
// corriger soi-même : c'est à l'utilisateur de comparer avec l'emballage.

import { findFood } from "./ingredientMatch";
import type { MealItem } from "./storage";

/** Boissons alcoolisées : l'alcool apporte des kcal absentes des macros. */
const alcohol = /\b(biere|vin|cidre|rhum|vodka|whisky|gin|liqueur|pastis|champagne|aperitif|spritz|alcool)\b/;

/** Plusieurs aliments ou une préparation : pas de valeur de référence unique. */
const composed = /&|,|\+|\b(et|avec|aux?|sur|sauce|facon|poelee|gratin|plat|salade|menu|assortiment|mix|melange)\b/;

const simple = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Énergie recalculée avec les coefficients du règlement UE 1169/2011 (4 kcal par g de
 * protéines ou de glucides, 9 par g de lipides). Null si une macro manque.
 */
export function macroKcal(item: Pick<MealItem, "protein100" | "carbs100" | "fat100">) {
  const { protein100, carbs100, fat100 } = item;
  if (protein100 === null || carbs100 === null || carbs100 === undefined || fat100 === null || fat100 === undefined) return null;
  return 4 * protein100 + 4 * carbs100 + 9 * fat100;
}

/** Messages d'alerte d'un aliment (vides si tout est cohérent). */
export function coherenceWarnings(item: MealItem): string[] {
  const warnings: string[] = [];
  const perPortionOnly = item.unit === "portion" && !item.portionGrams;
  if (perPortionOnly || item.source === "recette") return warnings;
  const unit = item.liquid ? "100 ml" : "100 g";
  // 1. Énergie et macros de la fiche ne collent pas (fibres et polyols tolérés).
  const computed = macroKcal(item);
  if (computed !== null && !alcohol.test(simple(item.name))) {
    const gap = Math.abs(item.kcal100 - computed);
    if (gap > 25 && gap / Math.max(item.kcal100, computed) > 0.25) {
      warnings.push(`Fiche incohérente : ${Math.round(item.kcal100)} kcal/${unit} annoncées, ses macros en donnent ~${Math.round(computed)}. Vérifiez l'emballage.`);
    }
  }
  // 2. Très loin de la valeur habituelle pour ce type d'aliment (table Ciqual).
  if (item.refKcal100 && item.refName) {
    const ratio = item.kcal100 / item.refKcal100;
    if ((ratio > 1.3 || ratio < 0.7) && Math.abs(item.kcal100 - item.refKcal100) > 40) {
      warnings.push(`Inhabituel : ${Math.round(item.kcal100)} kcal/${unit}, d'habitude ~${Math.round(item.refKcal100)} pour « ${item.refName} ». Vérifiez l'emballage.`);
    }
  }
  return warnings;
}

/**
 * Valeur de référence (Ciqual) d'un produit de marque, pour la comparer à sa fiche.
 * Rien pour un féculent sec (sa référence serait la version cuite) ni pour un aliment Ciqual.
 */
export async function referenceFor(item: MealItem): Promise<Pick<MealItem, "refKcal100" | "refName"> | null> {
  if (item.source !== "off" || item.cookedFactor || item.ref?.startsWith("energie:")) return null;
  const name = item.name.split(" · ")[0];
  // Un plat composé (« St Jacques fondue de poireaux & riz ») ne se compare pas à un seul aliment.
  if (composed.test(simple(name))) return null;
  const reference = await findFood(name).catch(() => null);
  if (!reference || reference.perPortionOnly) return null;
  return { refKcal100: reference.kcal100, refName: reference.name };
}

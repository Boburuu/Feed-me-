// Hydratation, en ml.
//
// Repère de l'EFSA (2010) : 2 L d'eau par jour pour une femme, 2,5 L pour un homme,
// dont environ 80 % viennent des boissons (le reste vient des aliments).

import type { Sex } from "./storage";

export const waterGoal = (sex: Sex) => (sex === "homme" ? 2000 : 1600);

/** Quantités proposées en un geste : verre, grand verre, canette ou gourde, bouteille. */
export const waterAmounts = [
  { ml: 200, label: "verre" },
  { ml: 300, label: "grand verre" },
  { ml: 330, label: "canette" },
  { ml: 500, label: "bouteille" },
];

/** Limite de saisie par jour, contre les doubles appuis répétés. */
export const WATER_MAX = 6000;

/** « 450 ml », « 1,2 L ». */
export const formatWater = (ml: number) =>
  ml >= 1000 ? `${(Math.round(ml / 100) / 10).toLocaleString("fr-FR")} L` : `${Math.round(ml)} ml`;

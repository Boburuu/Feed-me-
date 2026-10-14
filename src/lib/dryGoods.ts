// Féculents et légumineuses : valeurs « sec » sur l'emballage, mais pesés cuits dans l'assiette.
//
// 102 g de riz basmati cuit ne valent pas 102 g de riz sec (359 kcal) mais environ 120 kcal :
// le riz absorbe l'eau de cuisson. Facteur = énergie de l'aliment sec ÷ énergie de l'aliment
// cuit, d'après la table Ciqual 2020 (ANSES) ; 102 g cuits ÷ 3,0 = 34 g de riz sec.

import { normalize } from "./foods";

/** Du plus précis au plus général : la première règle qui correspond l'emporte. */
const rules: { match: RegExp; factor: number; label: string }[] = [
  { match: /\briz\b.*\b(basmati|thai|jasmin|parfume)|\b(basmati|thai|jasmin)\b.*\briz\b|\bbasmati\b/, factor: 352 / 117, label: "riz basmati" }, // riz blanc cru / riz basmati cuit
  { match: /\briz\b.*\bcomplet|\bcomplet\b.*\briz\b/, factor: 350 / 158, label: "riz complet" },
  { match: /vermicelle.*\bsoja\b/, factor: 344 / 61, label: "vermicelle de soja" },
  { match: /vermicelle.*\briz\b|\briz\b.*vermicelle|nouilles de riz/, factor: 365 / 89, label: "vermicelle de riz" },
  { match: /\briz\b/, factor: 352 / 145, label: "riz" },
  { match: /\b(pates?|spaghetti|penne|tagliatelle|coquillettes|macaroni|fusilli|farfalle|linguine|rigatoni|torsades|nouilles|lasagnes? seches|udon|soba)\b/, factor: 336 / 126, label: "pâtes" },
  { match: /\b(semoule|couscous)\b/, factor: 352 / 122, label: "semoule" },
  { match: /\bquinoa\b/, factor: 358 / 149, label: "quinoa" },
  { match: /\bboulgour\b/, factor: 351 / 111, label: "boulgour" },
  { match: /\blentilles?\b/, factor: 331 / 124, label: "lentilles" },
  { match: /\bpois chiches?\b/, factor: 351 / 147, label: "pois chiches" },
  { match: /\bharicots? (blancs?|rouges?|noirs?|secs?)\b|\bflageolets?\b/, factor: 308 / 114, label: "haricots secs" },
  { match: /\bpolenta\b/, factor: 350 / 78, label: "polenta" },
];

/** En dessous, l'aliment est déjà cuit ou en conserve (riz cuit 145 kcal, pois chiches égouttés 122). */
const DRY_MIN_KCAL = 280;

/**
 * Facteur sec → cuit d'un féculent vendu sec, ou null : ni féculent, ni sec (déjà cuit,
 * précuit pour micro-ondes, en conserve), ou un plat (« riz cantonais » reste un plat).
 */
export function cookedFactor(name: string, kcal100: number) {
  if (kcal100 < DRY_MIN_KCAL) return null;
  const key = normalize(name);
  if (/\b(cuit|cuite|cuits|cuites|precuit|appertise|egoutte|cantonais|sauce|salade|gateau|biscuit|galette|souffle|chips|farine|lait|boisson)\b/.test(key)) return null;
  const rule = rules.find((item) => item.match.test(key));
  return rule ? { factor: Math.round(rule.factor * 100) / 100, label: rule.label } : null;
}

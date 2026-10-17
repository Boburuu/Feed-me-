// Produit photographié de face (sans code-barres visible) : le texte de l'emballage
// (marque, nom du produit) sert de recherche dans Open Food Facts, puis les produits
// trouvés sont classés selon les mots lus. Rien n'est deviné : la personne choisit.

import { normalize, type FoodResult } from "./foods";

export type ReadLine = { text: string; height: number };

/** Mentions d'emballage qui ne nomment pas le produit. */
const NOISE = /\b(nutri ?score|suggestion|presentation|declaration|nutritionnelle|valeurs?|moyennes?|ingredients?|recyclable|emballage|poids|net|lot|dluo|ddm|consommer|conserver|tranches?|portions?|pieces?|sachets?|nouveau|nouvelle|offre|gratuit|prix|promo)\b/;
const STOP = new Set(["de", "du", "des", "la", "le", "les", "pour", "par", "au", "aux", "et", "en", "avec", "sans", "un", "une", "with", "the", "and", "of", "kcal", "net"]);

/** Mots utiles d'un texte lu (sans chiffres, quantités ni mots vides). */
export function wordsOf(text: string) {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP.has(word) && !/\d/.test(word));
}

/** Lignes qui peuvent nommer le produit, les plus grosses d'abord. */
const usefulLines = (lines: ReadLine[]) =>
  lines
    .filter((line) => line.text.trim() && !NOISE.test(normalize(line.text)))
    .map((line) => ({ words: wordsOf(line.text), height: line.height }))
    .filter((line) => line.words.length > 0)
    .sort((a, b) => b.height - a.height);

/**
 * Recherche tirée de l'emballage : les lignes écrites le plus gros d'abord (« Hamburger »,
 * « Milbona »), puis les suivantes (« préparation de fromage fondu »), jusqu'à 5 mots.
 * Un seul mot (« hamburger ») trouverait des pains à burger : on en garde plusieurs.
 */
export function packageQuery(lines: ReadLine[], maxWords = 5): string {
  const words: string[] = [];
  for (const line of usefulLines(lines)) {
    for (const word of line.words) {
      if (!words.includes(word)) words.push(word);
      if (words.length >= maxWords) return words.join(" ");
    }
  }
  return words.join(" ");
}

/**
 * Produits trouvés classés par nombre de mots lus sur l'emballage présents dans leur nom
 * et leur marque (« Fromage fondu pour Hamburger · Milbona » avant « Pains à hamburger »).
 * Ceux qui n'ont qu'un mot en commun sont écartés quand on en a lu plusieurs.
 */
export function rankByPackage<T extends Pick<FoodResult, "name" | "brand">>(results: T[], lines: ReadLine[]): T[] {
  const read = new Set(usefulLines(lines).flatMap((line) => line.words));
  const scored = results.map((result, index) => {
    const own = new Set(wordsOf(`${result.name} ${result.brand ?? ""}`));
    return { result, index, score: [...own].filter((word) => read.has(word)).length };
  });
  const minimum = read.size >= 2 ? 2 : 1;
  return scored
    .filter((entry) => entry.score >= minimum)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}

// Plusieurs fiches Open Food Facts pour un même produit (un code-barres par pays ou par
// format, saisies par des bénévoles) : une seule ligne dans la recherche, la version
// française la plus complète d'abord, les autres accessibles en « N versions ».

import { normalize, type FoodResult } from "./foods";

export type OffMeta = { france: boolean; country: string | null; completeness: number; scans: number; quantity?: string };
export type WithMeta = FoodResult & { meta?: OffMeta };

/** Pays lisible à partir des étiquettes Open Food Facts (« en:france » → « France »). */
const countryNames: Record<string, string> = {
  france: "France", belgium: "Belgique", switzerland: "Suisse", germany: "Allemagne", spain: "Espagne", italy: "Italie",
  "united-kingdom": "Royaume-Uni", "united-states": "États-Unis", canada: "Canada", morocco: "Maroc", algeria: "Algérie",
  tunisia: "Tunisie", netherlands: "Pays-Bas", portugal: "Portugal", philippines: "Philippines", poland: "Pologne",
  mauritius: "Maurice", croatia: "Croatie", austria: "Autriche", luxembourg: "Luxembourg", reunion: "La Réunion", "united-arab-emirates": "Émirats arabes unis",
};
export function countryOf(tags: string[] | undefined) {
  const list = (tags ?? []).map((tag) => tag.replace(/^en:/, ""));
  const france = list.includes("france");
  const first = france ? "france" : list.find((tag) => tag !== "world");
  return { france, country: first ? countryNames[first] ?? first.replace(/-/g, " ") : null };
}

/** Meilleure version d'abord : vendue en France, puis la plus complète, puis la plus scannée. */
const better = (a: WithMeta, b: WithMeta) =>
  Number(b.meta?.france ?? false) - Number(a.meta?.france ?? false)
  || (b.meta?.completeness ?? 0) - (a.meta?.completeness ?? 0)
  || (b.meta?.scans ?? 0) - (a.meta?.scans ?? 0);

const sameProduct = (a: WithMeta, b: WithMeta) => {
  if (normalize(a.name) !== normalize(b.name)) return false;
  // Marque : identique, ou absente d'une des deux fiches.
  if (a.brand && b.brand && normalize(a.brand) !== normalize(b.brand)) return false;
  const high = Math.max(a.kcal100, b.kcal100);
  return high === 0 || Math.abs(a.kcal100 - b.kcal100) <= 0.2 * high;
};

/** « France · 1,5 L » : ce qui distingue une version des autres. */
export const versionLabel = (item: WithMeta) => [item.meta?.country, item.meta?.quantity?.trim()].filter(Boolean).join(" · ") || "Autre version";

/** Regroupe les versions d'un même produit ; l'ordre de la recherche est gardé. */
export function groupVersions(items: WithMeta[]): FoodResult[] {
  const groups: WithMeta[][] = [];
  for (const item of items) {
    const group = groups.find((entry) => sameProduct(entry[0], item));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups.map((group) => {
    const [best, ...others] = [...group].sort(better);
    const { meta: _meta, ...result } = best;
    return {
      ...result,
      ...(best.meta ? { versionLabel: versionLabel(best) } : {}),
      ...(others.length ? { versions: others.map(({ meta, ...other }) => ({ ...other, versionLabel: versionLabel({ ...other, meta }) })) } : {}),
    };
  });
}

// Fast-foods (cahier § 6 / v2 § 8) : produits des enseignes avec leurs valeurs officielles.
//
// Seules des valeurs publiées par l'enseigne elle-même sont embarquées (rien d'estimé).
// Quand une enseigne ne les publie pas sous une forme lisible, l'app le dit et propose les
// autres moyens (recherche Open Food Facts, aliment créé avec les valeurs de son appli).
// Un menu n'a pas de valeurs à lui : c'est un burger + un accompagnement + une boisson
// (+ une sauce), ajoutés comme des aliments séparés — rien n'est compté deux fois.

import { normalize, type FoodResult } from "../foods";
import { BK_SOURCE, burgerKing, type BkRow } from "./burgerKing";
import { MCDO_SOURCE, mcdonalds, type McdoRow } from "./mcdonalds";
import { SUBWAY_SOURCE, subway, type SubwayRow } from "./subway";

export type BrandId = "bk" | "mcdo" | "kfc" | "subway" | "quick" | "dominos" | "pizzahut" | "marie";

export type Brand = {
  id: BrandId;
  name: string;
  /** Valeurs officielles embarquées dans l'app. */
  catalogue?: { source: string; url: string; date: string };
  /** Pas de valeurs embarquées : pourquoi, et où les trouver. */
  missing?: string;
  /** Précision affichée avec la carte (valeurs partielles…). */
  note?: string;
  /** Marque de supermarché : ses produits sont dans Open Food Facts. */
  offQuery?: string;
};

export const brands: Brand[] = [
  { id: "bk", name: "Burger King", catalogue: { source: BK_SOURCE.name, url: BK_SOURCE.url, date: BK_SOURCE.date } },
  { id: "mcdo", name: "McDonald's", catalogue: { source: MCDO_SOURCE.name, url: MCDO_SOURCE.url, date: MCDO_SOURCE.date } },
  {
    id: "kfc",
    name: "KFC",
    missing: "KFC France ne publie en ligne que le Nutri-Score de ses produits, sans les calories : rien n'est embarqué. Les valeurs sont parfois affichées en restaurant ou dans l'appli KFC : crée l'aliment avec ces valeurs.",
  },
  {
    id: "subway",
    name: "Subway",
    catalogue: { source: SUBWAY_SOURCE.name, url: SUBWAY_SOURCE.url, date: SUBWAY_SOURCE.date },
    note: "Subway ne publie que les calories : protéines, glucides et lipides restent inconnus. Sandwichs pour un SUB 15 cm (30 cm : mets 2).",
  },
  {
    id: "quick",
    name: "Quick",
    missing: "Quick ne publie pas les valeurs nutritionnelles de ses produits sur son site (seulement leur description) : rien n'est embarqué. Crée le produit avec les valeurs affichées en restaurant ou dans l'appli Quick.",
  },
  {
    id: "dominos",
    name: "Domino's",
    missing: "Domino's France ne publie en ligne que le Nutri-Score de ses pizzas, sans les calories : rien n'est embarqué. Crée la pizza avec les valeurs de l'appli Domino's, ou compose-la avec ses ingrédients.",
  },
  {
    id: "pizzahut",
    name: "Pizza Hut",
    missing: "Pizza Hut France publie un tableau des allergènes, mais pas de valeurs nutritionnelles : rien n'est embarqué. Crée la pizza avec les valeurs affichées en restaurant.",
  },
  { id: "marie", name: "Marie", offQuery: "Marie" },
];

export type FastFoodItem = {
  brand: BrandId;
  name: string;
  category: string;
  /** Portion vendue : poids (g) et, pour une boisson, volume (ml). */
  grams: number | null;
  ml: number | null;
  kcal: number;
  /** Inconnus quand l'enseigne ne publie que les calories (Subway). */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  satFat: number | null;
  salt: number | null;
  fiber?: number | null;
  /** Portion vendue quand elle n'a pas de poids publié (« 1 SUB 15 cm »). */
  portionLabel?: string;
};

const fromBk = ([name, category, grams, ml, kcal, protein, carbs, sugars, fat, satFat, salt]: BkRow): FastFoodItem => ({ brand: "bk", name, category, grams, ml, kcal, protein, carbs, fat, sugars, satFat, salt });
const fromMcdo = ([name, category, grams, ml, kcal, protein, carbs, sugars, fat, satFat, salt, fiber]: McdoRow): FastFoodItem => ({ brand: "mcdo", name, category, grams, ml, kcal, protein, carbs, fat, sugars, satFat, salt, fiber });
const fromSubway = ([name, category, kcal, portionLabel]: SubwayRow): FastFoodItem => ({ brand: "subway", name, category, grams: null, ml: null, kcal, protein: null, carbs: null, fat: null, sugars: null, satFat: null, salt: null, portionLabel });

/** Ordre d'affichage : le plat d'abord, la boisson et la sauce à la fin. */
const categoryOrder = ["Burgers", "Sandwichs", "Poulet & snacks", "Wraps & tortillas", "Salades & bowls", "Petit-déjeuner", "Frites & accompagnements", "Desserts", "Boissons", "Sauces"];
const orderOf = (category: string) => (categoryOrder.includes(category) ? categoryOrder.indexOf(category) : categoryOrder.length);

export const fastFoodItems: FastFoodItem[] = [...burgerKing.map(fromBk), ...mcdonalds.map(fromMcdo), ...subway.map(fromSubway)].sort((a, b) => orderOf(a.category) - orderOf(b.category) || a.name.localeCompare(b.name, "fr"));

export const categoriesOf = (brand: BrandId) => [...new Set(fastFoodItems.filter((item) => item.brand === brand).map((item) => item.category))];

/** Produit d'une enseigne → aliment de l'app, compté à la portion vendue. */
export function fastFoodResult(item: FastFoodItem): FoodResult {
  const brand = brands.find((entry) => entry.id === item.brand)!;
  const base = item.ml ?? item.grams;
  const per100 = (value: number) => (base ? (value / base) * 100 : value);
  const maybe = (value: number | null | undefined) => (value === null || value === undefined ? null : per100(value));
  return {
    name: item.name,
    brand: brand.name,
    source: "enseigne",
    ref: `${item.brand}:${normalize(item.name).replace(/ /g, "-")}`,
    kcal100: per100(item.kcal),
    protein100: maybe(item.protein),
    carbs100: maybe(item.carbs),
    fat100: maybe(item.fat),
    // Sucres de la carte BK non repris : certaines valeurs officielles sont douteuses (30 g dans 10 nuggets).
    sugars100: item.brand === "bk" ? null : maybe(item.sugars),
    satFat100: maybe(item.satFat),
    fiber100: maybe(item.fiber),
    salt100: maybe(item.salt),
    // Sans poids publié, les valeurs restent « par portion ».
    ...(base ? { portionGrams: base, portionLabel: `1 portion (${base} ${item.ml ? "ml" : "g"})` } : { perPortionOnly: true, portionLabel: item.portionLabel ?? "1 portion" }),
    liquid: item.ml ? true : undefined,
    detail: `${brand.name} · ${item.kcal} kcal · officiel, indicatif`,
  };
}

/** Recherche dans les cartes (« whopper », « bk frites »). */
export function searchFastFood(query: string, brand?: BrandId) {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const exact = words.filter((word) => !["bk", "burger", "king"].includes(word)).join(" ");
  // Le nom exact d'abord (« whopper » → Whopper®), puis ceux qui commencent par la recherche, puis les plus courts.
  const rank = (item: FastFoodItem) => {
    const name = normalize(item.name);
    return (name === exact ? 0 : name.startsWith(exact) ? 1 : 2) * 1000 + name.length;
  };
  return fastFoodItems
    .filter((item) => {
      if (brand && item.brand !== brand) return false;
      const text = `${normalize(item.name)} ${normalize(brands.find((entry) => entry.id === item.brand)!.name)} ${item.brand}`.split(" ");
      return words.every((word) => text.some((part) => part.startsWith(word)));
    })
    .sort((a, b) => rank(a) - rank(b));
}

/** Étapes d'un menu : plat, accompagnement, boisson, sauce. */
export const menuSteps = [
  { key: "main", label: "Le plat", categories: ["Burgers", "Wraps & tortillas", "Poulet & snacks", "Salades & bowls"] },
  { key: "side", label: "L'accompagnement", categories: ["Frites & accompagnements", "Poulet & snacks"] },
  { key: "drink", label: "La boisson", categories: ["Boissons"] },
  { key: "sauce", label: "La sauce", categories: ["Sauces"] },
] as const;

export type MenuChoice = Partial<Record<(typeof menuSteps)[number]["key"], FastFoodItem>>;

/** Total d'un menu : la somme de ses éléments choisis, chacun une fois. */
export function menuTotal(choice: MenuChoice) {
  const items = Object.values(choice).filter((item): item is FastFoodItem => !!item);
  return {
    kcal: items.reduce((sum, item) => sum + item.kcal, 0),
    // Inconnu (Subway) : compté 0 dans le total, signalé par « partial ».
    protein: items.reduce((sum, item) => sum + (item.protein ?? 0), 0),
    carbs: items.reduce((sum, item) => sum + (item.carbs ?? 0), 0),
    fat: items.reduce((sum, item) => sum + (item.fat ?? 0), 0),
    partial: items.some((item) => item.protein === null),
    items,
  };
}

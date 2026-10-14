// Fast-foods (cahier § 6 / v2 § 8) : produits des enseignes avec leurs valeurs officielles.
//
// Seules des valeurs publiées par l'enseigne elle-même sont embarquées (rien d'estimé).
// Quand une enseigne ne les publie pas sous une forme lisible, l'app le dit et propose les
// autres moyens (recherche Open Food Facts, aliment créé avec les valeurs de son appli).
// Un menu n'a pas de valeurs à lui : c'est un burger + un accompagnement + une boisson
// (+ une sauce), ajoutés comme des aliments séparés — rien n'est compté deux fois.

import { normalize, type FoodResult } from "../foods";
import { BK_SOURCE, burgerKing, type BkRow } from "./burgerKing";

export type BrandId = "bk" | "mcdo" | "kfc" | "subway" | "marie";

export type Brand = {
  id: BrandId;
  name: string;
  /** Valeurs officielles embarquées dans l'app. */
  catalogue?: { source: string; url: string; date: string };
  /** Pas de valeurs embarquées : pourquoi, et où les trouver. */
  missing?: string;
  /** Marque de supermarché : ses produits sont dans Open Food Facts. */
  offQuery?: string;
};

export const brands: Brand[] = [
  { id: "bk", name: "Burger King", catalogue: { source: BK_SOURCE.name, url: BK_SOURCE.url, date: BK_SOURCE.date } },
  {
    id: "mcdo",
    name: "McDonald's",
    missing: "Le site de McDonald's France bloque la lecture automatique de ses fiches : ses valeurs ne sont pas embarquées. Elles sont dans l'appli McDo (fiche du produit, « Informations nutritionnelles ») : crée l'aliment avec ces valeurs, il sera retrouvé ensuite.",
  },
  {
    id: "kfc",
    name: "KFC",
    missing: "KFC France ne publie en ligne que le Nutri-Score de ses produits, sans les calories : rien n'est embarqué. Les valeurs sont parfois affichées en restaurant ou dans l'appli KFC : crée l'aliment avec ces valeurs.",
  },
  {
    id: "subway",
    name: "Subway",
    missing: "Subway France ne publie pas de valeurs exploitables (fiches vides ou incomplètes) : rien n'est embarqué. Crée le sandwich avec les valeurs affichées en restaurant, ou compose-le avec ses ingrédients.",
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
  protein: number;
  carbs: number;
  fat: number;
};

const fromBk = ([name, category, grams, ml, kcal, protein, carbs, _sugars, fat]: BkRow): FastFoodItem => ({ brand: "bk", name, category, grams, ml, kcal, protein, carbs, fat });

/** Ordre d'affichage : le plat d'abord, la boisson et la sauce à la fin. */
const categoryOrder = ["Burgers", "Poulet & snacks", "Wraps & tortillas", "Salades & bowls", "Frites & accompagnements", "Desserts", "Boissons", "Sauces"];
const orderOf = (category: string) => (categoryOrder.includes(category) ? categoryOrder.indexOf(category) : categoryOrder.length);

export const fastFoodItems: FastFoodItem[] = burgerKing.map(fromBk).sort((a, b) => orderOf(a.category) - orderOf(b.category) || a.name.localeCompare(b.name, "fr"));

export const categoriesOf = (brand: BrandId) => [...new Set(fastFoodItems.filter((item) => item.brand === brand).map((item) => item.category))];

/** Produit d'une enseigne → aliment de l'app, compté à la portion vendue. */
export function fastFoodResult(item: FastFoodItem): FoodResult {
  const brand = brands.find((entry) => entry.id === item.brand)!;
  const base = item.ml ?? item.grams;
  const per100 = (value: number) => (base ? (value / base) * 100 : value);
  return {
    name: item.name,
    brand: brand.name,
    source: "enseigne",
    ref: `${item.brand}:${normalize(item.name).replace(/ /g, "-")}`,
    kcal100: per100(item.kcal),
    protein100: per100(item.protein),
    carbs100: per100(item.carbs),
    fat100: per100(item.fat),
    // Sans poids publié, les valeurs restent « par portion ».
    ...(base ? { portionGrams: base, portionLabel: `1 portion (${base} ${item.ml ? "ml" : "g"})` } : { perPortionOnly: true, portionLabel: "1 portion" }),
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
    protein: items.reduce((sum, item) => sum + item.protein, 0),
    carbs: items.reduce((sum, item) => sum + item.carbs, 0),
    fat: items.reduce((sum, item) => sum + item.fat, 0),
    items,
  };
}

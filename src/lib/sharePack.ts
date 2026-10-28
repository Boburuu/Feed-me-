// Liens de partage plus courts : noms de champs abrégés, nombres arrondis, champs vides ou
// en double retirés, date sans l'heure. Les anciens liens (format 1) restent lisibles.

/** Champs connus → clé courte (ne jamais changer une clé existante : les liens envoyés la gardent). */
const keys: Record<string, string> = {
  app: "A", version: "V", kind: "K", sharedAt: "D", recipe: "R", meal: "M",
  name: "n", category: "c", items: "i", plate: "p", servings: "sv", share: "sh",
  ingredients: "g", title: "t", steps: "st", text: "tx", time: "tm", portions: "po",
  calories: "ca", protein: "pr", carbs: "cb", fat: "ft", volumeMl: "vm", pieces: "pc", totalGrams: "tg", url: "u", notes: "no", nutritionManual: "nm",
  quantity: "q", unit: "un", food: "fd", choice: "ch",
  source: "s", ref: "r", kcal100: "k", protein100: "P", carbs100: "C", fat100: "F", sugars100: "S", satFat100: "T", fiber100: "B", salt100: "L",
  portionGrams: "pg", portionLabel: "pl", servingGrams: "sg", servingLabel: "sl", pieceGrams: "ig", pieceLabel: "il", packageGrams: "kg",
  liquid: "lq", prepared: "pp", waterMl: "wm", volumeUnit: "vu", density: "dn", cookedFactor: "cf", weighedCooked: "wc", cookedBy: "cy", hydrates: "hy",
  drinkMlPerPart: "dp", recipePortions: "rp", recipePieces: "ri", recipeGrams: "rg", recipeCount: "rc", recipeGramsEstimated: "re", matchedName: "mn",
  products: "pd",
};
const back = Object.fromEntries(Object.entries(keys).map(([long, short]) => [short, long]));
const MARK = "f";

// Valeurs nutritionnelles : 2 décimales (0,69999998 → 0,7) ; quantités : 4 (0,3689 part garde son poids).
const sameServing = (item: Record<string, unknown>) =>
  item.servingGrams !== undefined && item.servingGrams === item.portionGrams && item.servingLabel === item.portionLabel;

const round = (value: number, key?: string) => (key === "quantity" ? Math.round(value * 10_000) / 10_000 : Math.round(value * 100) / 100);

function shrink(value: unknown, parent?: Record<string, unknown>, key?: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => shrink(entry));
  if (typeof value === "number") return round(value, key);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    // Valeurs vides retirées ; gardées quand elles disent quelque chose (« ne compte pas dans l’hydratation », quantité « au goût »).
    // Vides retirés ; « null » (valeur inconnue) et « false » (ne compte pas dans l'hydratation) gardés.
    if (entry === undefined || entry === "" || (entry === false && key !== "hydrates")) continue;
    // En double : la portion habituelle identique à la portion (« ss » permet de la remettre).
    if ((key === "servingGrams" || key === "servingLabel") && sameServing(source)) continue;
    if (key === "name" && parent && typeof source.food === "object" && source.food && (source.food as { name?: string }).name === entry) continue;
    out[keys[key] ?? key] = shrink(entry, source, key);
  }
  if (sameServing(source)) out.ss = 1;
  return out;
}

function grow(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(grow);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[back[key] ?? key] = grow(entry);
  if (out.ss === 1) {
    delete out.ss;
    out.servingGrams = out.portionGrams;
    if (out.portionLabel !== undefined) out.servingLabel = out.portionLabel;
  }
  const food = out.food as { name?: string } | undefined;
  if (food && out.name === undefined) out.name = food.name;
  return out;
}

/** Partage → objet compact (format 2). */
export function packShare(payload: Record<string, unknown>) {
  const { app: _app, version: _version, sharedAt, ...rest } = payload;
  return { [MARK]: 2, ...(shrink({ ...rest, sharedAt: typeof sharedAt === "string" ? sharedAt.slice(0, 10) : sharedAt }, {}) as Record<string, unknown>) };
}

/** Objet lu dans un lien : format 2 remis en forme, format 1 inchangé. */
export function unpackShare(value: unknown): unknown {
  const object = value as Record<string, unknown> | null;
  if (!object || object[MARK] !== 2) return value;
  const { [MARK]: _mark, ...rest } = object;
  return { app: "feedme", version: 1, ...(grow(rest) as Record<string, unknown>) };
}

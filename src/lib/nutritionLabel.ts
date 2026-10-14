// Lecture d'un tableau de valeurs nutritionnelles photographié, et comparaison avec la fiche.
//
// La reconnaissance de texte rend des lignes avec leur position : on reconstruit les rangées
// du tableau (lignes à la même hauteur), puis on lit, pour chaque nutriment, la valeur de la
// première colonne (« pour 100 g ») et celle de la portion si elle existe. Les pourcentages
// d'apports de référence (« 14 % ») sont ignorés. Tout reste modifiable par l'utilisateur :
// une lecture incertaine ne remplace jamais rien d'elle-même.

export type OcrBox = { text: string; x: number; y: number; w: number; h: number };

export const nutrientKeys = ["kcal", "fat", "satFat", "carbs", "sugars", "fiber", "protein", "salt"] as const;
export type NutrientKey = (typeof nutrientKeys)[number];
export type NutrientValues = Partial<Record<NutrientKey, number>>;

export const nutrientLabels: Record<NutrientKey, string> = {
  kcal: "Énergie (kcal)", fat: "Lipides", satFat: "dont saturés", carbs: "Glucides", sugars: "dont sucres", fiber: "Fibres", protein: "Protéines", salt: "Sel",
};

export type LabelReading = {
  /** Valeurs pour 100 g (ou 100 ml). */
  per100: NutrientValues;
  /** Valeurs par portion, quand l'étiquette en donne. */
  perPortion: NutrientValues;
  portionGrams?: number;
  base: "100 g" | "100 ml";
  /** Nutriments vus sur l'étiquette mais dont la valeur lue est impossible (à taper). */
  unsure: NutrientKey[];
};

const simple = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Rangées du tableau : lignes de texte à la même hauteur, de gauche à droite. */
export function rowsOf(boxes: OcrBox[]) {
  const sorted = [...boxes].filter((box) => box.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: { center: number; height: number; boxes: OcrBox[] }[] = [];
  for (const box of sorted) {
    const center = box.y + box.h / 2;
    const row = rows.find((item) => Math.abs(item.center - center) < 0.55 * Math.max(item.height, box.h));
    if (row) row.boxes.push(box);
    else rows.push({ center, height: box.h, boxes: [box] });
  }
  return rows.map((row) => row.boxes.sort((a, b) => a.x - b.x).map((box) => box.text).join(" "));
}

/** Nutriment désigné par une rangée (« dont acides gras saturés » avant « matières grasses »). */
function nutrientOf(row: string): NutrientKey | null {
  if (/satur/.test(row)) return "satFat";
  if (/sucres|sugars/.test(row)) return "sugars";
  if (/mati[e]res? grasses|lipides|graisses|\bfat\b/.test(row)) return "fat";
  if (/glucides|carbohydrate/.test(row)) return "carbs";
  if (/fibres?|fibers?/.test(row)) return "fiber";
  if (/prot[e]ines?|protein/.test(row)) return "protein";
  if (/\bsel\b|\bsalt\b/.test(row)) return "salt";
  return null;
}

type Amount = { value: number; unit: string };

/** Nombres d'une rangée avec leur unité, sans les pourcentages (« 14 % »). */
function amountsOf(row: string): Amount[] {
  const amounts: Amount[] = [];
  const pattern = /(<\s*)?(\d+(?:[.,]\d+)?)\s*(kcal|kj|mg|g|ml)?(\s*%)?/gi;
  for (const match of row.matchAll(pattern)) {
    if (match[4]) continue;
    const value = Number(match[2].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    amounts.push({ value: match[3]?.toLowerCase() === "mg" ? value / 1000 : value, unit: (match[3] ?? "").toLowerCase() });
  }
  return amounts;
}

/** Lit un tableau nutritionnel à partir des lignes reconnues (avec ou sans position). */
export function parseNutritionLabel(input: OcrBox[] | string[]): LabelReading {
  const rows = (typeof input[0] === "string" ? (input as string[]) : rowsOf(input as OcrBox[])).map(simple);
  const reading: LabelReading = { per100: {}, perPortion: {}, base: "100 g", unsure: [] };

  // En-têtes : base « pour 100 ml », et poids de la portion (« par portion de 225 g »).
  for (const row of rows) {
    if (/100\s*ml/.test(row)) reading.base = "100 ml";
    const portion = row.match(/portion\s*(?:de|:)?\s*\(?(\d+(?:[.,]\d+)?)\s*(g|ml)/) ?? row.match(/pour\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b(?!.*100)/);
    if (portion && Number(portion[1].replace(",", ".")) !== 100) reading.portionGrams ??= Number(portion[1].replace(",", "."));
  }

  // Énergie : les kcal imprimées priment ; les kJ ÷ 4,184 ne servent que s'il n'y en a pas.
  let printedKcal = false;
  for (const row of rows) {
    const amounts = amountsOf(row.replace(/100\s*(g|ml)/g, " ").replace(/\(\s*\d+\s*kj\s*\/\s*\d+\s*kcal\s*\)/g, " "));
    if (/energ|kcal|\bkj\b/.test(row)) {
      const kcal = amounts.filter((item) => item.unit === "kcal").map((item) => item.value);
      const kj = amounts.filter((item) => item.unit === "kj").map((item) => Math.round(item.value / 4.184));
      if (kcal.length && !printedKcal) {
        printedKcal = true;
        reading.per100.kcal = kcal[0];
        if (kcal[1] !== undefined) reading.perPortion.kcal = kcal[1];
      } else if (!printedKcal && kj.length && reading.per100.kcal === undefined) {
        reading.per100.kcal = kj[0];
        if (kj[1] !== undefined) reading.perPortion.kcal = kj[1];
      }
      if (kcal.length || kj.length) continue;
    }
    const key = nutrientOf(row);
    if (!key) continue;
    const grams = amounts.filter((item) => item.unit === "g" || item.unit === "").map((item) => item.value);
    // Plus de 100 g pour 100 g est impossible : virgule ou « g » mal lus (« 3,2 g » → « 329 »).
    // La case reste vide, à remplir à la main, plutôt que de proposer une valeur fausse.
    if (grams[0] !== undefined && grams[0] > 100) {
      reading.unsure.push(key);
      continue;
    }
    if (grams[0] !== undefined && reading.per100[key] === undefined) reading.per100[key] = grams[0];
    if (grams[1] !== undefined && reading.perPortion[key] === undefined) reading.perPortion[key] = grams[1];
  }
  return reading;
}

export type Comparison = { key: NutrientKey; app: number | null; label: number | null; gap: number | null; status: "ok" | "check" | "missing" };

/**
 * Écart entre la fiche et l'étiquette, pour 100 g. Les arrondis d'étiquetage sont tolérés :
 * moins de 7 %, ou moins de 5 kcal / 0,5 g d'écart, c'est une correspondance.
 */
export function compareWithLabel(app: NutrientValues, label: NutrientValues): Comparison[] {
  return nutrientKeys.map((key) => {
    const a = app[key] ?? null;
    const l = label[key] ?? null;
    if (a === null || l === null) return { key, app: a, label: l, gap: null, status: "missing" as const };
    const gap = l === 0 ? (a === 0 ? 0 : 100) : ((a - l) / l) * 100;
    const small = Math.abs(a - l) <= (key === "kcal" ? 5 : 0.5);
    return { key, app: a, label: l, gap, status: small || Math.abs(gap) <= 7 ? "ok" as const : "check" as const };
  });
}

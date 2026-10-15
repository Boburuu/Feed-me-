// McDonald's France : catalogue de l'app à partir des fiches officielles mcdonalds.fr/nos-produits,
// relevées produit par produit (scripts/data/mcdonalds-releves.jsonl, 16/10/2026).
//   node scripts/mcdonalds-catalogue.cjs
// Contrôles : énergie cohérente avec les macronutriments, poids identique quelle que soit la
// colonne, contenance cohérente avec les valeurs, valeurs identiques entre produits différents
// (copie) et fiches non remplies écartées. Les écarts sont listés en sortie.
const fs = require("fs");
const path = require("path");
const IN = path.join(__dirname, "data", "mcdonalds-releves.jsonl");
const OUT = path.join(__dirname, "..", "src", "lib", "fastFood", "mcdonalds.ts");

const rows = fs.readFileSync(IN, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const rejected = [];
const ok = [];
const categoryOf = (url) => {
  const [section, slug] = url.split("/");
  if (/sauce|ketchup|vinaigrette/.test(slug)) return "Sauces";
  if (/frite|potatoes/.test(slug)) return "Frites & accompagnements";
  if (/nuggets|boite-a-partager/.test(slug)) return "Poulet & snacks";
  if (/wrap/.test(slug)) return "Wraps & tortillas";
  if (section === "nos-salades-du-jour") return "Salades & bowls";
  if (section === "nos-boissons") return "Boissons";
  if (section === "nos-desserts" || /pomme|raisins|berlingo|bio-a-boire|danonino|milkshake|sundae|glace|macaron|mcpops|donut|apple-pie|cookie|muffin/.test(slug)) return "Desserts";
  if (section === "petit-dejeuner") return "Petit-déjeuner";
  if (/tomates/.test(slug)) return "Frites & accompagnements";
  return "Burgers";
};
const sizeMl = (size) => {
  const m = /(\d+(?:[.,]\d+)?)\s*(cl|ml)\b/i.exec(size ?? "");
  return m ? Math.round(Number(m[1].replace(",", ".")) * (m[2].toLowerCase() === "cl" ? 10 : 1)) : null;
};

for (const r of rows) {
  const why = (reason) => rejected.push(`${r.name} : ${reason}`);
  if (r.flag) { why(r.flag); continue; }
  const P = r.perProduct, H = r.per100;
  if (!P || P.kcal == null || P.protein == null || P.carbs == null || P.fat == null) { why("valeurs manquantes"); continue; }
  const atwater = 4 * P.carbs + 4 * P.protein + 9 * P.fat + 2 * (P.fiber ?? 0);
  if (Math.abs(atwater - P.kcal) > Math.max(25, 0.2 * P.kcal)) { why(`énergie ${P.kcal} kcal ≠ macros ${Math.round(atwater)} kcal`); continue; }
  // Poids de la portion, d'après l'énergie (et vérifié avec les autres colonnes).
  let grams = H && H.kcal >= 20 ? (P.kcal / H.kcal) * 100 : null;
  if (grams !== null) {
    const others = ["fat", "carbs", "protein"].filter((k) => H[k] >= 3 && P[k] >= 3).map((k) => (P[k] / H[k]) * 100);
    if (others.some((g) => Math.abs(g - grams) > 0.25 * grams)) { why("colonnes « pour 100 g » et « par produit » incohérentes"); continue; }
  }
  const ml = sizeMl(r.size);
  const liquid = /^nos-boissons\//.test(r.url) || /milkshake|bio-a-boire/.test(r.url);
  // Boissons : la contenance annoncée doit correspondre aux valeurs (sauf frappés et milkshakes,
  // servis avec glace et mousse : le gobelet est plus grand que la boisson).
  const blended = /frapp|milkshake|smoothie|glac/i.test(r.name);
  if (liquid && !blended && ml && grams !== null && Math.abs(grams - ml) > 0.3 * ml) { why(`contenance annoncée ${ml} ml, mais valeurs d'environ ${Math.round(grams)} ml`); continue; }
  // Une boisson servie dans un gobelet ne peut pas apporter moins qu'un verre de 100 ml.
  if (liquid && /sprite|coca|fanta|fuze|lipton|oasis|ice.?tea/i.test(r.name) && H && H.kcal >= 5 && P.kcal < H.kcal) { why(`${P.kcal} kcal par produit pour ${H.kcal} kcal aux 100 ml : impossible pour un gobelet`); continue; }
  ok.push({ name: r.name.replace(/\s+/g, " ").trim(), category: categoryOf(r.url), grams: grams === null ? null : Math.round(grams), ml: liquid ? (blended && grams !== null ? Math.round(grams) : ml ?? (grams === null ? null : Math.round(grams))) : null, kcal: Math.round(P.kcal), protein: P.protein, carbs: P.carbs, sugars: P.sugars ?? null, fat: P.fat, satFat: P.satFat ?? null, fiber: P.fiber ?? null, salt: P.salt ?? null, url: r.url });
}
// Deux produits différents avec exactement les mêmes valeurs : copie probable, on ne sait pas laquelle est juste.
const bySig = new Map();
for (const item of ok) { const sig = [item.kcal, item.protein, item.carbs, item.fat, item.sugars].join("/"); bySig.set(sig, [...(bySig.get(sig) ?? []), item]); }
const final = [];
for (const [, list] of bySig) {
  const names = new Set(list.map((item) => item.name.toLowerCase()));
  if (names.size > 1 && list[0].kcal > 5) { list.forEach((item) => rejected.push(`${item.name} : mêmes valeurs qu'un autre produit (copie probable)`)); continue; }
  final.push(list[0]);
}
const order = ["Burgers", "Poulet & snacks", "Wraps & tortillas", "Salades & bowls", "Petit-déjeuner", "Frites & accompagnements", "Desserts", "Boissons", "Sauces"];
final.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name, "fr"));
const r1 = (x) => (x == null ? "null" : Math.round(x * 100) / 100);
const lines = final.map((i) => `  [${JSON.stringify(i.name)}, ${JSON.stringify(i.category)}, ${i.grams ?? "null"}, ${i.ml ?? "null"}, ${i.kcal}, ${r1(i.protein)}, ${r1(i.carbs)}, ${r1(i.sugars)}, ${r1(i.fat)}, ${r1(i.satFat)}, ${r1(i.salt)}, ${r1(i.fiber)}],`);
fs.writeFileSync(OUT, `// McDonald's France : valeurs nutritionnelles officielles par produit, relevées une à une sur
// mcdonalds.fr/nos-produits le 16/10/2026 (générées par scripts/mcdonalds-catalogue.cjs, ne pas
// modifier à la main). Fiches incohérentes ou copiées écartées. Valeurs indicatives (moyennes
// annoncées par McDonald's, variables selon la préparation).
//
// [nom, catégorie, poids (g), volume (ml), kcal, protéines, glucides, dont sucres, lipides, dont saturés, sel, fibres]
export type McdoRow = [string, string, number | null, number | null, number, number, number, number | null, number, number | null, number | null, number | null];

export const MCDO_SOURCE = { name: "McDonald's France", url: "https://www.mcdonalds.fr/nos-produits", date: "2026-10-16" };

export const mcdonalds: McdoRow[] = [
${lines.join("\n")}
];
`);
console.log("relevés", rows.length, "gardés", final.length, "écartés", rejected.length);
console.log(rejected.join("\n"));

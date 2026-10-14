// Met à jour src/lib/fastFood/burgerKing.ts depuis la carte officielle burgerking.fr.
//   node scripts/burgerking-catalogue.cjs <dossier-de-travail>
// Télécharge les pages de la carte (qui embarquent les valeurs nutritionnelles de chaque
// produit), écarte les valeurs incohérentes, puis écrit le catalogue de l'app.
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "src", "lib", "fastFood", "burgerKing.ts");
async function download(dir, pages) {
  fs.mkdirSync(dir, { recursive: true });
  for (const page of pages) {
    const res = await fetch(`https://www.burgerking.fr/carte/${page}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", "Accept-Language": "fr-FR,fr;q=0.9" } });
    if (!res.ok) throw new Error(`burgerking.fr/carte/${page} : ${res.status}`);
    fs.writeFileSync(`${dir}/bk-${page}.html`, await res.text());
  }
}
const dir = process.argv[2] ?? "bk-pages";
const outFile = OUT;
// Chaque page embarque tout le catalogue ; plusieurs pages servent à recouper les valeurs.
const pages = ["burgers", "a-partager", "poulet-du-dimanche", "wrap", "snacks-sauces", "desserts-boissons", "menus-enfants", "nouveautes", "menus", "bon-et-pas-cher"];
const num = (t) => { if (t == null) return null; const s = String(t).replace(/\s/g, "").replace(",", "."); if (/^<\d/.test(s)) return 0; const v = Number(s); return Number.isFinite(v) ? v : null; };
const key = (name) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/®|™|\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
download(dir, pages).then(() => {
const all = [];
for (const page of pages) {
  const s = fs.readFileSync(`${dir}/bk-${page}.html`, "utf8").replace(/\\/g, "\\").replace(/\\"/g, '"').replace(/\u0026/g, "&").replace(/\u003c/g, "<");
  const re = /\{"id":"(\d+)","plu":"([^"]*)","name":"([^"]*)","type":"([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) {
    const at = s.indexOf('"nutrition":[', m.index);
    if (at < 0) continue;
    const close = s.indexOf("]", at);
    if (/\{"id":"\d+","plu":/.test(s.slice(m.index + 10, close))) continue;
    let rows; try { rows = JSON.parse(s.slice(at + 12, close + 1)); } catch { continue; }
    const v = {}; for (const r of rows) v[r.item.split(".").pop()] = { p: num(r.portion), s: num(r.share), unit: r.unit };
    all.push({ page, plu: m[2], name: m[3].split("\\u0026").join("&").replace(/\s+/g, " ").replace(/\s*\.$/, "").trim(), v });
  }
}
const rejected = [];
const ok = [];
for (const item of all) {
  const { v, name } = item;
  const e = v.energy, f = v.fat, c = v.carbs, p = v.protein;
  const why = (r) => { rejected.push(`${name} : ${r}`); };
  if (!e || e.p == null || f?.p == null || c?.p == null || p?.p == null) { why("valeurs manquantes"); continue; }
  // Énergie cohérente avec les macronutriments (4 / 4 / 9), par portion.
  const atwater = 4 * c.p + 4 * p.p + 9 * f.p;
  if (Math.abs(atwater - e.p) > Math.max(25, 0.2 * e.p)) { why(`énergie ${e.p} kcal ≠ macros ${Math.round(atwater)} kcal`); continue; }
  // Poids de la portion : énergie portion / énergie pour 100 g ; les autres colonnes doivent donner le même.
  let grams = null;
  if (e.s > 0) {
    grams = (e.p / e.s) * 100;
    const others = [f, c, p].filter((x) => x.s >= 3 && x.p >= 3).map((x) => (x.p / x.s) * 100);
    if (others.some((g) => Math.abs(g - grams) > 0.2 * grams)) { why(`colonnes « pour 100 g » incohérentes`); continue; }
    if (grams < 5 || grams > 1500) { why(`poids impossible ${Math.round(grams)} g`); continue; }
  }
  const drink = /(\d+)\s*cl/i.exec(name);
  // Sucres ≤ glucides, saturés ≤ lipides : sinon la valeur est fausse et laissée inconnue.
  const sugars = v.sugars?.p != null && v.sugars.p <= c.p ? v.sugars.p : null;
  const satFat = v.saturates?.p != null && v.saturates.p <= f.p ? v.saturates.p : null;
  ok.push({ ...item, grams: grams && Math.round(grams), ml: drink ? Number(drink[1]) * 10 : undefined, kcal: Math.round(e.p), fat: f.p, satFat, carbs: c.p, sugars, protein: p.p, salt: v.salt?.p ?? null });
}
// Doublons : même nom, mêmes valeurs → une seule fiche ; valeurs différentes → écartées (on ne choisit pas au hasard).
const groups = new Map();
for (const item of ok) { const k = key(item.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(item); }
// Copier-coller dans la carte officielle : mêmes valeurs exactes pour au moins 3 produits
// différents (« Perrier » = « Coca-Cola 50 cl ») → on ne sait pas lequel est juste, on écarte.
const bySig = new Map();
for (const [k, list] of groups) for (const i of list) { const sg = [i.kcal, i.fat, i.carbs, i.protein].join("/"); if (!bySig.has(sg)) bySig.set(sg, new Set()); bySig.get(sg).add(k); }
const copied = new Set([...bySig.entries()].filter(([sg, names]) => names.size >= 3 && Number(sg.split("/")[0]) > 5).map(([, names]) => names).flatMap((names) => [...names]));
for (const k of copied) { rejected.push(groups.get(k)[0].name + " : mêmes valeurs que d'autres produits (copie)"); groups.delete(k); }
// Vraisemblance selon le nom : une eau ou un « zéro » sans calories, une boisson peu calorique.
const per100 = (i) => (i.ml ? (i.kcal / i.ml) * 100 : i.grams ? (i.kcal / i.grams) * 100 : null);
for (const [k, list] of groups) {
  const i = list[0];
  const p = per100(i);
  const zero = /\b(eau|vittel|perrier|evian|zero|sans sucres?|the vert)\b/.test(k);
  const drink = /\b(\d+ ?cl|coca|fanta|sprite|fuze|lipton|ice tea|oasis|schweppes|nectar|jus|minute maid|red bull)\b/.test(k);
  const fruit = /\b(pom potes|compote|king fruits)\b/.test(k);
  const bad = (zero && i.kcal > 10) || (drink && p !== null && (p > 70 || (i.protein / (i.ml ?? i.grams)) * 100 > 4)) || (fruit && p !== null && p > 120);
  if (bad) { rejected.push(i.name + " : valeurs invraisemblables pour ce produit"); groups.delete(k); }
}
const final = [];
for (const [k, list] of groups) {
  const sig = (i) => [i.kcal, i.fat, i.carbs, i.protein].join("/");
  const sigs = new Set(list.map(sig));
  if (sigs.size > 1) {
    // Une valeur majoritaire nette (au moins 2 fois plus fréquente) l'emporte, sinon on écarte.
    const counts = [...sigs].map((s) => [s, list.filter((i) => sig(i) === s).length]).sort((a, b) => b[1] - a[1]);
    if (counts[0][1] < 2 * counts[1][1]) { rejected.push(`${list[0].name} : plusieurs valeurs officielles (${[...sigs].join(" ; ")})`); continue; }
    list.splice(0, list.length, ...list.filter((i) => sig(i) === counts[0][0]));
  }
  const best = list.find((i) => !["nouveautes", "menus", "bon-et-pas-cher"].includes(i.page)) ?? list[0];
  final.push({ ...best, category: categoryOf(k, best) });
}
// Chaque page de la carte embarque tout le catalogue : la catégorie se déduit du nom.
function categoryOf(k, i) {
  if (/\bking fries\b/.test(k)) return "Frites & accompagnements";
  if (/\b(sauces?|andalouse|ketchup|mayo(nnaise)?)\b/.test(k)) return "Sauces";
  if (/\b(wrap|tortilla)\b/.test(k)) return "Wraps & tortillas";
  if (/\b(pancakes?)\b/.test(k)) return "Desserts";
  if (i.ml || /\b(sucre|soda|coca|fanta|sprite|fuze|lipton|oasis|schweppes|nectar|jus|minute maid|red bull|vittel|perrier|cafe|expresso|cappuccino|latte|the|boisson|frappe|shake|smoothie|ice cafe)\b/.test(k)) return "Boissons";
  if (/\b(sundae|donut|muffin|cookie|fusion|gaufre|beignets?|brownie|madeleine|ice burger|pops|yaourt|king fruits|pom potes|churros|tarte|cheesecake)\b/.test(k)) return "Desserts";
  if (/\b(frites|fries|onion rings|potatoes|petite salade|gaufrette|king carotte)\b/.test(k)) return "Frites & accompagnements";
  if (/\b(nuggets|tenders|wings|chili cheese|crousty|kingbox|bucket|mozza)\b/.test(k)) return "Poulet & snacks";
  if (/\b(salade|bowl)\b/.test(k)) return "Salades & bowls";
  if (/\b(wrap|tortilla)\b/.test(k)) return "Wraps & tortillas";
  return "Burgers";
}
// Fautes de frappe de la carte (« KKINGBOX », « Lousiane ») : même catégorie et mêmes
// valeurs exactes qu'un autre nom → une seule fiche.
{
  // L'orthographe la plus fréquente sur le site l'emporte.
  const seenCount = (i) => all.filter((x) => x.name === i.name).length;
  const seen = new Map();
  for (const i of [...final]) {
    const sg = [i.category, i.kcal, i.fat, i.carbs, i.protein, i.sugars, i.salt, i.grams].join("/");
    const prev = seen.get(sg);
    if (prev && Number(i.kcal) > 5) final.splice(final.indexOf(seenCount(i) > seenCount(prev) ? prev : i), 1);
    if (!prev || seenCount(i) > seenCount(prev)) seen.set(sg, i);
  }
}
final.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
const r = (x) => (x == null ? "null" : Math.round(x * 10) / 10);
const lines = final.map((i) => `  [${JSON.stringify(i.name)}, ${JSON.stringify(i.category)}, ${i.grams ?? "null"}, ${i.ml ?? "null"}, ${i.kcal}, ${r(i.protein)}, ${r(i.carbs)}, ${r(i.sugars)}, ${r(i.fat)}, ${r(i.satFat)}, ${r(i.salt)}],`);
const header = `// Burger King France : valeurs nutritionnelles officielles, par portion, relevées sur
// burgerking.fr/carte le 14/10/2026 (générées automatiquement, ne pas modifier à la main).
// Ont été écartés : les produits dont l'énergie ne correspond pas aux macronutriments,
// dont les colonnes « pour 100 g » se contredisent, et ceux publiés avec plusieurs valeurs.
// Valeurs indicatives : la recette d'un restaurant peut varier.
//
// [nom, catégorie, poids de la portion (g), volume (ml), kcal, protéines, glucides, dont sucres, lipides, dont saturés, sel]
export type BkRow = [string, string, number | null, number | null, number, number, number, number | null, number, number | null, number | null];

export const BK_SOURCE = { name: "Burger King France", url: "https://www.burgerking.fr/carte", date: "2026-10-14" };

export const burgerKing: BkRow[] = [
${lines.join("\n")}
];
`;
fs.writeFileSync(outFile, header);
console.log("lus", all.length, "valides", ok.length, "fiches", final.length, "écartées", rejected.length);
console.log([...new Set(rejected)].join("\n"));
}).catch((error) => { console.error(error.message); process.exit(1); });

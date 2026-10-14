import { useEffect, useMemo, useRef, useState } from "react";
import FoodResultRow, { kcalLabel } from "./FoodResultRow";
import Icon from "./Icon";
import MealLineEditor from "./MealLineEditor";
import {
  itemCalories,
  itemGrams,
  itemProtein,
  carbsOf,
  fatOf,
  normalize,
  openFoodFactsPortion,
  searchCiqual,
  searchCommon,
  drinkShortcuts,
  searchOpenFoodFacts,
  energyResult,
  recipeResult,
  searchOwn,
  toMealItem,
  type FoodResult,
} from "../lib/foods";
import { referenceFor } from "../lib/coherence";
import type { MealDraft } from "../lib/drafts";
import { cookedFactor } from "../lib/dryGoods";
import { energyBrands, energyDrinks } from "../lib/energyDrinks";
import { analyzeMealPhoto, liveScanAvailable, photoRecognitionAvailable, scanBarcode, scanBarcodePhoto, type PhotoAnalysis, type ScanResult } from "../lib/foodPhoto";
import { mealCategories, todayKey, type CustomFood, type Leftover, type Meal, type MealCategory, type MealItem, type Recipe } from "../lib/storage";

/** Ce qui accompagne l'enregistrement : un reste à garder, des restes consommés. */
export type MealExtras = { leftover?: Omit<Leftover, "id">; usedLeftovers: { id: number; parts: number }[] };

type MealComposerProps = {
  date: string;
  category: MealCategory;
  recipes: Recipe[];
  customFoods: CustomFood[];
  meals: Meal[];
  onSave: (meal: Omit<Meal, "id">, extras: MealExtras) => void;
  /** Restes d'assiettes maison encore bons (4 jours au frigo). */
  leftovers: Leftover[];
  onDiscardLeftover: (id: number) => void;
  onCreateFood: (food: CustomFood) => void;
  /** Photo prise depuis l'accueil, à analyser dès l'ouverture. */
  initialPhoto?: File;
  /** Aliments déjà ajoutés à l'ouverture (recette choisie dans le carnet). */
  initialItems?: MealItem[];
  /** Repas déjà noté, à modifier (moment, jour, aliments, quantités). */
  editing?: Meal;
  /** Saisie reprise après une fermeture de l'app ou de la fenêtre. */
  draft?: MealDraft;
  /** Chaque changement de la saisie, pour l'enregistrer comme brouillon. */
  onDraft?: (draft: MealDraft) => void;
  onDiscardDraft?: () => void;
  /** Ouvert depuis le planning : repas prévu, pas encore mangé. */
  planned?: boolean;
};

type Line = MealItem & { key: number };

/**
 * Aliments d'un repas noté. Les repas sans détail (photo, recette ajoutée en un geste,
 * anciennes versions) deviennent une ligne « 1 portion » avec leurs calories.
 */
function itemsOf(meal: Meal): MealItem[] {
  // Repas noté avant le choix « sec / cuit » : le choix apparaît, compté sec comme avant tant qu'on n'y touche pas.
  if (meal.items?.length) {
    return meal.items.map((item) => {
      if (item.cookedFactor || item.source === "recette") return item;
      const dry = cookedFactor(item.name, item.kcal100);
      return dry ? { ...item, cookedFactor: dry.factor } : item;
    });
  }
  return [{ name: meal.name, source: "perso", unit: "portion", quantity: 1, kcal100: meal.calories, protein100: meal.protein ?? null, portionLabel: "1 portion" }];
}

/** Nombre de résultats montrés avant « Voir plus » : la recherche doit rester lisible. */
const SHOWN = { common: 4, ciqual: 4, own: 3, brands: 3 };

const sourceName = { ciqual: "Ciqual", off: "Open Food Facts", recette: "Ma recette", perso: "Mon aliment" } as const;
/** « 1 banane » → « banane », « 1 portion (200 ml) » → « portion ». */
const unitName = (label?: string) => (label ?? "portion").replace(/^1\s+/, "").replace(/\s*\(.*$/, "").slice(0, 14);
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function MealComposer({ date: initialDate, category: initialCategory, recipes, customFoods, meals, onSave, onCreateFood, initialPhoto, initialItems, editing, draft, onDraft, onDiscardDraft, planned: plannedAtStart, leftovers, onDiscardLeftover }: MealComposerProps) {
  const today = todayKey();
  const [date, setDate] = useState(draft?.date ?? editing?.date ?? initialDate);
  const [category, setCategory] = useState(draft?.category ?? editing?.category ?? initialCategory);
  const [query, setQuery] = useState(draft?.query ?? "");
  const [lines, setLines] = useState<Line[]>(() => (draft ? draft.lines : editing ? itemsOf(editing) : initialItems ?? []).map((item, index) => ({ ...item, key: index + 1 })));
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  // Recettes du carnet, les plus récentes d'abord.
  const myRecipes = useMemo(() => [...recipes].sort((a, b) => b.id - a.id), [recipes]);
  const [common, setCommon] = useState<FoodResult[]>([]);
  const [ciqual, setCiqual] = useState<FoodResult[]>([]);
  const [brands, setBrands] = useState<FoodResult[]>([]);
  const [brandState, setBrandState] = useState<"idle" | "loading" | "error" | "offline">("idle");
  const [expanded, setExpanded] = useState({ common: false, ciqual: false, own: false, brands: false, variants: false });
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "", perPortion: false, keep: true });
  const searchInput = useRef<HTMLInputElement>(null);
  // Assiette maison : plat préparé pour plusieurs personnes, dont on mange une part.
  const [mode, setMode] = useState<"meal" | "plate">(draft?.mode ?? (editing?.plate ? "plate" : "meal"));
  const [plateName, setPlateName] = useState(draft?.plateName ?? (editing?.plate && !editing.name.startsWith("Assiette maison : ") ? editing.name : ""));
  const [servings, setServings] = useState(draft?.servings ?? editing?.plate?.servings ?? 2);
  // Part mangée retrouvée : en demi-parts, le reste en réglage fin.
  const [parts, setParts] = useState(draft ? draft.parts : editing?.plate ? Math.max(0.5, Math.round(editing.plate.share * editing.plate.servings * 2) / 2) : 1);
  /** Réglage fin, en points de pourcentage : « un peu plus » que la part. */
  const [adjust, setAdjust] = useState(draft ? draft.adjust : editing?.plate ? Math.round(editing.plate.share * 100 - (Math.max(0.5, Math.round(editing.plate.share * editing.plate.servings * 2) / 2) / editing.plate.servings) * 100) : 0);
  const [keepLeftover, setKeepLeftover] = useState(draft?.keepLeftover ?? true);
  /** Prévu : affiché au planning, compté nulle part tant qu'il n'est pas confirmé « mangé ». */
  const [plannedChoice, setPlannedChoice] = useState(draft?.planned ?? (editing ? editing.status === "planned" : !!plannedAtStart));
  // Un repas d'un jour à venir ne peut pas déjà avoir été mangé.
  const planned = plannedChoice || date > today;

  // Brouillon enregistré à chaque changement : rien n'est perdu si Android ferme l'app.
  useEffect(() => {
    onDraft?.({ editingId: editing?.id, date, category, mode, lines: lines.map(({ key: _key, ...item }) => item), plateName, servings, parts, adjust, keepLeftover, query, planned: plannedChoice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, category, mode, lines, plateName, servings, parts, adjust, keepLeftover, query, plannedChoice]);
  const searching = query.trim().length > 0;
  const [drinks, setDrinks] = useState<FoodResult[]>([]);
  const [showAllDrinks, setShowAllDrinks] = useState(false);
  /** Liste des boissons énergisantes : fermée, ou ouverte sur une marque. */
  const [energyBrand, setEnergyBrand] = useState<string | null>(null);
  useEffect(() => { drinkShortcuts().then(setDrinks).catch(() => undefined); }, []);
  const photoInput = useRef<HTMLInputElement>(null);
  /** Sans « capture » : Android ouvre la galerie au lieu de l'appareil photo. */
  const galleryInput = useRef<HTMLInputElement>(null);
  /** Navigateur (iPhone) : le code-barres se prend en photo. */
  const barcodeInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ src: string; state: "loading" | "done" | "error"; analysis: PhotoAnalysis | null } | null>(null);
  const [scanNote, setScanNote] = useState("");

  /** Analyse une photo : code-barres, nom sur l'emballage, puis plat probable. */
  const analyzePhoto = (file: File) => {
    setScanNote("");
    setPhoto({ src: URL.createObjectURL(file), state: "loading", analysis: null });
    analyzeMealPhoto(file)
      .then((analysis) => setPhoto((current) => current && { ...current, state: "done", analysis }))
      .catch(() => setPhoto((current) => current && { ...current, state: "error" }));
  };

  /** Scanner de code-barres (caméra en direct) : le produit exact, via Open Food Facts. */
  /** Résultat d'un scan, en direct (Android) ou en photo (iPhone). */
  const showScan = (result: ScanResult) => {
    if (result.status === "found") add(result.food);
    else if (result.status === "unknown") setScanNote(`Code ${result.code} inconnu d'Open Food Facts : cherchez le produit par son nom, ou créez-le.`);
    else if (result.status === "installing") setScanNote("Installation du scanner par Android… Réessayez dans quelques secondes.");
    else if (result.status === "unreadable") setScanNote("Code-barres illisible : reprenez-le de près, bien net et à plat.");
  };

  const scan = async () => {
    setScanNote("");
    // Navigateur (iPhone) : pas de scanner en direct, le code-barres se prend en photo.
    if (!liveScanAvailable()) { barcodeInput.current?.click(); return; }
    try {
      showScan(await scanBarcode());
    } catch {
      setScanNote(navigator.onLine ? "Le scan n'a pas abouti. Réessayez, bien éclairé." : "Hors connexion : le scan a besoin d'internet pour trouver le produit.");
    }
  };

  const scanPhoto = async (picked: File) => {
    setScanNote("Lecture du code-barres…");
    try {
      const result = await scanBarcodePhoto(picked);
      setScanNote("");
      showScan(result);
    } catch {
      setScanNote(navigator.onLine ? "Le code-barres n'a pas pu être lu." : "Hors connexion : le scan a besoin d'internet pour trouver le produit.");
    }
  };
  useEffect(() => {
    if (initialPhoto) analyzePhoto(initialPhoto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const own = useMemo(() => (searching ? searchOwn(query, recipes, customFoods) : []), [query, searching, recipes, customFoods]);

  // Aliments déjà utilisés, du plus récent au plus ancien.
  const recents = useMemo(() => {
    const seen = new Set<string>();
    const list: FoodResult[] = [];
    for (const meal of [...meals].sort((a, b) => b.id - a.id)) {
      for (const item of meal.items ?? []) {
        const key = `${item.source}|${item.ref ?? normalize(item.name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Proposé avec sa portion d'origine, pas l'unité choisie la dernière fois (« 1 boîte »).
        const perPortionOnly = item.unit === "portion" && !item.portionGrams;
        list.push({ ...item, perPortionOnly, ...(perPortionOnly ? {} : { portionGrams: item.servingGrams, portionLabel: item.servingLabel }), detail: sourceName[item.source] });
      }
      if (list.length >= 6) break;
    }
    return list.slice(0, 6);
  }, [meals]);

  useEffect(() => setExpanded({ common: false, ciqual: false, own: false, brands: false, variants: false }), [query]);

  // Ciqual : instantané, hors ligne. Les aliments courants d'abord, sous un nom simple ;
  // les autres variantes de la table ensuite, sans doublon.
  useEffect(() => {
    let alive = true;
    Promise.all([searchCommon(query, 40), searchCiqual(query, 15)])
      .then(([simple, all]) => {
        if (!alive) return;
        // Référence d'un aliment courant : « code Ciqual:nom simple ».
        const shown = new Set(simple.map((item) => item.ref?.split(":")[0]));
        setCommon(simple);
        setCiqual(all.filter((item) => !shown.has(item.ref)));
      })
      .catch(() => { if (alive) { setCommon([]); setCiqual([]); } });
    return () => { alive = false; };
  }, [query]);

  // Open Food Facts : en ligne, après une courte pause de frappe.
  useEffect(() => {
    setBrands([]);
    if (normalize(query).length < 3) { setBrandState("idle"); return; }
    if (!navigator.onLine) { setBrandState("offline"); return; }
    const signal = { cancelled: false };
    setBrandState("loading");
    const timer = window.setTimeout(() => {
      searchOpenFoodFacts(query, signal)
        .then((results) => { if (!signal.cancelled) { setBrands(results); setBrandState("idle"); } })
        .catch(() => { if (!signal.cancelled) setBrandState("error"); });
    }, 600);
    return () => { signal.cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const add = (result: FoodResult) => {
    const key = Date.now();
    const item = toMealItem(result);
    setLines((current) => [...current, { ...item, ...(item.cookedFactor ? { weighedCooked: mode === "meal" } : {}), key }]);
    setQuery("");
    // Produit de marque : comparé à la valeur habituelle de ce type d'aliment (fiche douteuse ?).
    referenceFor(item).then((reference) => {
      if (reference) setLines((current) => current.map((line) => (line.key === key ? { ...line, ...reference } : line)));
    }).catch(() => undefined);
    // Produit de marque : on récupère la portion indiquée sur l'emballage.
    if (result.source === "off" && /^\d+$/.test(result.ref ?? "")) {
      openFoodFactsPortion(result.ref!).then((portion) => {
        if (!portion) return;
        setLines((current) => current.map((line) => {
          if (line.key !== key) return line;
          // Compté à la pièce (« 1 tranche ») : on garde la pièce, la portion devient un choix de plus.
          if (line.pieceGrams && line.portionGrams === line.pieceGrams) return { ...line, servingGrams: portion.grams, servingLabel: portion.label };
          return { ...line, portionGrams: portion.grams, portionLabel: portion.label, servingGrams: portion.grams, servingLabel: portion.label, ...(line.unit === "g" && line.quantity === 100 ? { unit: "portion" as const, quantity: 1 } : {}) };
        }));
      }).catch(() => undefined);
    }
  };

  const update = (key: number, change: Partial<MealItem>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  const createFood = (event: React.FormEvent) => {
    event.preventDefault();
    const kcal = Number(custom.kcal.replace(",", "."));
    if (!custom.name.trim() || !kcal) return;
    const protein = custom.protein ? Number(custom.protein.replace(",", ".")) : null;
    const carbs = custom.carbs ? Number(custom.carbs.replace(",", ".")) : null;
    const fat = custom.fat ? Number(custom.fat.replace(",", ".")) : null;
    const portion = Number(custom.portion.replace(",", ".")) || undefined;
    const food: CustomFood = custom.perPortion
      ? { id: Date.now(), name: custom.name.trim(), kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat, portionLabel: "1 portion" }
      : { id: Date.now(), name: custom.name.trim(), kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat, portionGrams: portion, portionLabel: portion ? `1 portion (${n(portion)} g)` : undefined };
    if (custom.keep) onCreateFood(food);
    add({ ...food, source: "perso", ref: String(food.id), detail: "Mon aliment", perPortionOnly: custom.perPortion });
    setCreating(false);
    setCustom({ name: "", kcal: "", protein: "", carbs: "", fat: "", portion: "", perPortion: false, keep: true });
  };

  const total = lines.reduce((sum, line) => sum + itemCalories(line), 0);
  const protein = Math.round(lines.reduce((sum, line) => sum + itemProtein(line), 0));
  // Glucides : utiles au suivi du diabète. « unknown » : aliments dont la base ne les donne pas.
  const { carbs, unknown: carbsUnknown } = carbsOf(lines);
  const carbsLabel = (value: number) => `${Math.round(value)} g de glucides${carbsUnknown ? ` (+ ${carbsUnknown} aliment${carbsUnknown > 1 ? "s" : ""} sans valeur)` : ""}`;
  const { fat } = fatOf(lines);

  const isPlate = mode === "plate";
  const share = isPlate ? Math.min(1, Math.max(0.05, parts / servings + adjust / 100)) : 1;
  const leftoverParts = Math.round((1 - share) * servings * 10) / 10;
  const freshLeftovers = leftovers.filter((item) => item.partsLeft > 0);

  const save = () => {
    if (!lines.length) return;
    const items: MealItem[] = lines.map(({ key: _key, ...item }) => item);
    const ingredients = items
      .map((item) => (item.ref?.startsWith("reste:") ? item.name.replace(/^Reste · /, "Reste : ") : item.name.split(" · ")[0].split(",")[0]))
      .join(", ");
    const name = isPlate ? plateName.trim() || `Assiette maison : ${ingredients}` : ingredients;
    const shortName = name.length > 70 ? `${name.slice(0, 67)}…` : name;
    const usedLeftovers = lines
      .filter((line) => line.ref?.startsWith("reste:"))
      .map((line) => ({ id: Number(line.ref!.slice(6)), parts: line.quantity }));
    onSave({
      date,
      ...(planned ? { status: "planned" as const } : {}),
      category,
      name: shortName,
      calories: Math.round(total * share),
      protein: Math.round(protein * share) || undefined,
      carbs: Math.round(carbs * share),
      fat: Math.round(fat * share),
      source: editing?.source ?? "manual",
      drinksCounted: true,
      items,
      ...(isPlate ? { plate: { servings, share } } : {}),
    }, {
      // Modification : les restes ont déjà été comptés à l'enregistrement du repas.
      usedLeftovers: editing || planned ? [] : usedLeftovers,
      leftover: !editing && !planned && isPlate && keepLeftover && leftoverParts > 0
        ? { name: shortName, date, partsLeft: leftoverParts, kcalPerPart: Math.round(total / servings), proteinPerPart: Math.round(protein / servings), carbsPerPart: Math.round(carbs / servings), fatPerPart: Math.round(fat / servings) }
        : undefined,
    });
  };

  /** Un reste devient un aliment « par part ». */
  const addLeftover = (item: Leftover) => {
    setLines((current) => [...current, {
      key: Date.now(),
      name: `Reste · ${item.name.replace(/^Assiette maison : /, "")}`,
      source: "perso",
      ref: `reste:${item.id}`,
      quantity: Math.min(1, item.partsLeft),
      unit: "portion",
      kcal100: item.kcalPerPart,
      protein100: item.proteinPerPart,
      carbs100: item.carbsPerPart ?? null,
      fat100: item.fatPerPart ?? null,
      portionLabel: "1 part",
    }]);
  };

  const resultRow = (result: FoodResult, index: number) => (
    <FoodResultRow key={`${result.source}-${result.ref ?? result.name}-${index}`} result={result} onPick={add} />
  );

  /** Section repliable : les premiers résultats, puis « Voir plus ». */
  const section = (title: string, list: FoodResult[], key: keyof typeof SHOWN) => list.length > 0 && (
    <>
      <p className="food-section">{title}</p>
      {(expanded[key] ? list : list.slice(0, SHOWN[key])).map(resultRow)}
      {!expanded[key] && list.length > SHOWN[key] && (
        <button type="button" className="text-button food-more" onClick={() => setExpanded((value) => ({ ...value, [key]: true }))}>Voir {list.length - SHOWN[key]} de plus</button>
      )}
    </>
  );

  return (
    <div className="meal-composer">
      {draft && (
        <div className="draft-banner" role="status">
          <span>Brouillon repris là où vous l'aviez laissé.</span>
          <button type="button" className="text-button" onClick={onDiscardDraft}>Recommencer</button>
        </div>
      )}
      <div className="meal-composer-when">
        <label>Jour<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Moment
          <select value={category} onChange={(e) => setCategory(e.target.value as MealCategory)}>
            {mealCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {date >= today && (
        <label className="awake-toggle planned-toggle">
          <input type="checkbox" checked={planned} disabled={date > today} onChange={(e) => setPlannedChoice(e.target.checked)} />
          <span>{date > today ? "Repas prévu (jour à venir) : il comptera quand vous l'aurez confirmé « mangé »" : "Prévu, pas encore mangé (ne compte pas tant qu'il n'est pas confirmé)"}</span>
        </label>
      )}

      <div className="sex-selector meal-mode" role="radiogroup" aria-label="Type de repas">
        <button type="button" role="radio" aria-checked={!isPlate} className={!isPlate ? "selected" : ""} onClick={() => setMode("meal")}>Repas</button>
        <button type="button" role="radio" aria-checked={isPlate} className={isPlate ? "selected" : ""} onClick={() => setMode("plate")}>Assiette maison</button>
      </div>
      {isPlate && !searching && !creating && (
        <div className="plate-intro">
          <input value={plateName} onChange={(e) => setPlateName(e.target.value)} placeholder="Nom du plat (facultatif) : colin, riz…" aria-label="Nom du plat" />
          <small>Ajoutez tout ce qui va dans la casserole (boîte entière ou entamée, filets, riz cru…), puis indiquez votre part.</small>
        </div>
      )}

      {!creating && (
        <div className="food-search">
          <Icon name="apple" size={18} />
          <input
            ref={searchInput}
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lines.length ? "Ajouter un autre aliment" : "Banane, bœuf bourguignon, Kinder…"}
            aria-label="Rechercher un aliment ou un plat"
          />
          {searching && <button type="button" className="food-search-clear" onClick={() => { setQuery(""); searchInput.current?.focus(); }} aria-label="Effacer la recherche"><Icon name="close" size={16} /></button>}
        </div>
      )}

      {/* Pendant la recherche : uniquement les résultats, rien ne se superpose. */}
      {searching && !creating && (
        <div className="food-results">
          {common.length > 0 ? (
            <>
              {section("Aliments courants", common, "common")}
              {/* Variantes techniques (« pulpe et peau », « appertisé »…) seulement sur demande. */}
              {ciqual.length > 0 && (expanded.variants
                ? section("Autres variantes · Ciqual (ANSES)", ciqual, "ciqual")
                : <button type="button" className="text-button food-more" onClick={() => setExpanded((value) => ({ ...value, variants: true }))}>Plus de choix ({ciqual.length} variantes : cuit, cru, en conserve…)</button>)}
            </>
          ) : section("Aliments et plats · Ciqual (ANSES)", ciqual, "ciqual")}
          {section("Mes recettes et aliments", own, "own")}
          {query.trim().length >= 3 && (
            expanded.brands ? (
              <>
                <p className="food-section">Produits de marque · Open Food Facts</p>
                {brandState === "loading" && <p className="food-hint"><span className="loader" /> Recherche…</p>}
                {brandState === "offline" && <p className="food-hint">Hors connexion : produits de marque indisponibles.</p>}
                {brandState === "error" && <p className="food-hint">Open Food Facts ne répond pas pour le moment.</p>}
                {brandState === "idle" && !brands.length && <p className="food-hint">Aucun produit trouvé.</p>}
                {brands.map(resultRow)}
              </>
            ) : (
              <button type="button" className="add-part" onClick={() => setExpanded((value) => ({ ...value, brands: true }))}>
                <Icon name="target" size={15} /> Voir les produits de marque{brandState === "idle" && brands.length ? ` (${brands.length})` : ""}
              </button>
            )
          )}
          {!ciqual.length && !own.length && query.trim().length < 3 && <p className="food-hint">Continuez à taper…</p>}
          <button type="button" className="add-part" onClick={() => { setCustom((value) => ({ ...value, name: query.trim() })); setCreating(true); }}>
            <Icon name="plus" size={15} /> Introuvable ? Créer « {query.trim()} »
          </button>
        </div>
      )}

      {creating && (
        <form className="custom-food" onSubmit={createFood}>
          <p className="plan-label">Nouvel aliment</p>
          <label>Nom<input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} required /></label>
          <div className="sex-selector" role="radiogroup" aria-label="Valeurs indiquées">
            <button type="button" role="radio" aria-checked={!custom.perPortion} className={!custom.perPortion ? "selected" : ""} onClick={() => setCustom({ ...custom, perPortion: false })}>Pour 100 g</button>
            <button type="button" role="radio" aria-checked={custom.perPortion} className={custom.perPortion ? "selected" : ""} onClick={() => setCustom({ ...custom, perPortion: true })}>Pour 1 portion</button>
          </div>
          <div className="recipe-fields">
            <label><span>Calories</span><div><input value={custom.kcal} onChange={(e) => setCustom({ ...custom, kcal: e.target.value })} inputMode="decimal" required /><small>kcal</small></div></label>
            <label><span>Protéines</span><div><input value={custom.protein} onChange={(e) => setCustom({ ...custom, protein: e.target.value })} inputMode="decimal" placeholder="—" /><small>g</small></div></label>
          </div>
          <div className="recipe-fields">
            <label><span>Glucides</span><div><input value={custom.carbs} onChange={(e) => setCustom({ ...custom, carbs: e.target.value })} inputMode="decimal" placeholder="—" /><small>g</small></div></label>
            <label><span>Lipides</span><div><input value={custom.fat} onChange={(e) => setCustom({ ...custom, fat: e.target.value })} inputMode="decimal" placeholder="—" /><small>g</small></div></label>
          </div>
          {!custom.perPortion && (
            <label>Poids d'une portion (facultatif)<input value={custom.portion} onChange={(e) => setCustom({ ...custom, portion: e.target.value })} inputMode="decimal" placeholder="Ex. 23,5 pour une barre" /></label>
          )}
          <label className="awake-toggle"><input type="checkbox" checked={custom.keep} onChange={(e) => setCustom({ ...custom, keep: e.target.checked })} /><span>Garder dans mes aliments</span></label>
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setCreating(false)}>Retour</button>
            <button type="submit" className="submit-button">Ajouter au repas</button>
          </div>
        </form>
      )}

      {!searching && !creating && photoRecognitionAvailable() && !photo && (
        <div className="capture-actions">
          <button type="button" className="add-part" onClick={() => photoInput.current?.click()}>
            <Icon name="camera" size={16} /> Photo
          </button>
          <button type="button" className="add-part" onClick={() => galleryInput.current?.click()}>
            <Icon name="image" size={16} /> Galerie
          </button>
          <button type="button" className="add-part" onClick={scan}>
            <Icon name="target" size={16} /> Code-barres
          </button>
        </div>
      )}
      {scanNote && !searching && <p className="food-hint">{scanNote}</p>}
      <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) analyzePhoto(file); }} />
      <input ref={galleryInput} className="hidden-input" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) analyzePhoto(file); }} />
      <input ref={barcodeInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void scanPhoto(file); }} />

      {!searching && !creating && photo && (() => {
        const analysis = photo.analysis;
        const found = !!analysis && (!!analysis.barcode || analysis.packaging.length > 0 || analysis.dishes.length > 0);
        const pick = (food: FoodResult) => { add(food); setPhoto(null); };
        const row = (food: FoodResult, key: string, badge?: string) => <FoodResultRow key={key} result={food} onPick={pick} badge={badge} />;
        return (
          <section className="photo-analysis">
            <div className="photo-analysis-head">
              <img src={photo.src} alt="Photo du repas" />
              <div>
                <strong>{photo.state === "loading" ? "Analyse de la photo…" : photo.state === "error" ? "Analyse impossible" : found ? "Qu'avez-vous pris ?" : "Rien de reconnu"}</strong>
                <small>
                  {photo.state === "loading" ? "Code-barres, emballage, puis plat." : found ? "Touchez le bon, puis ajustez la quantité." : "Essayez le code-barres, ou cherchez-le ci-dessus."}
                </small>
              </div>
              {photo.state === "loading"
                ? <span className="loader" />
                : <button type="button" className="icon-button" onClick={() => setPhoto(null)} aria-label="Fermer l'analyse"><Icon name="close" size={16} /></button>}
            </div>
            {analysis?.barcode && (<><p className="food-section">Produit reconnu · code-barres</p>{row(analysis.barcode, "barcode")}</>)}
            {analysis && analysis.packaging.length > 0 && (
              <><p className="food-section">D'après l'emballage</p>{analysis.packaging.map((food, index) => row(food, `pack-${food.ref ?? index}`))}</>
            )}
            {analysis && analysis.dishes.length > 0 && (
              <><p className="food-section">Plat probable</p>{analysis.dishes.map((item, index) => row(item.food, `dish-${index}`, `${Math.round(Math.min(1, item.score) * 100)} %`))}</>
            )}
            {photo.state === "done" && found && <small className="photo-note">Estimation à partir de la photo : vérifiez le produit et la quantité.</small>}
            {photo.state !== "loading" && (
              <button type="button" className="text-button food-more" onClick={() => { setPhoto(null); void scan(); }}>Scanner le code-barres à la place</button>
            )}
          </section>
        );
      })()}

      {!searching && !creating && (
        <>
          {lines.length > 0 && (
            <section className="meal-lines">
              {lines.map((line) => (
                <MealLineEditor
                  key={line.key}
                  line={line}
                  onChange={(change) => update(line.key, change)}
                  onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                />
              ))}
              <div className="meal-total">
                <span>
                  {isPlate ? "Plat entier" : "Total"}
                  <small>{carbsLabel(carbs)}{protein > 0 ? ` · ${protein} g de protéines` : ""}{fat > 0 ? ` · ${Math.round(fat)} g de lipides` : ""}</small>
                </span>
                <strong>{Math.round(total)} kcal</strong>
              </div>
            </section>
          )}

          {isPlate && lines.length > 0 && (
            <section className="plate-share">
              <div className="share-row">
                <span>Préparé pour</span>
                <div className="stepper">
                  <button type="button" onClick={() => { setServings((value) => Math.max(1, value - 1)); setParts((value) => Math.min(value, Math.max(1, servings - 1))); }} aria-label="Une personne de moins"><Icon name="minus" size={15} /></button>
                  <strong>{servings}</strong>
                  <button type="button" onClick={() => setServings((value) => Math.min(12, value + 1))} aria-label="Une personne de plus"><Icon name="plus" size={15} /></button>
                </div>
                <span>pers.</span>
              </div>
              <div className="share-row">
                <span>J'en mange</span>
                <div className="stepper">
                  <button type="button" onClick={() => { setParts((value) => Math.max(0.5, value - 0.5)); setAdjust(0); }} aria-label="Une demi-part de moins"><Icon name="minus" size={15} /></button>
                  <strong>{parts.toLocaleString("fr-FR")}</strong>
                  <button type="button" onClick={() => { setParts((value) => Math.min(servings, value + 0.5)); setAdjust(0); }} aria-label="Une demi-part de plus"><Icon name="plus" size={15} /></button>
                </div>
                <span>part{parts > 1 ? "s" : ""}</span>
              </div>
              <div className="share-row">
                <span>Ma part réelle</span>
                <div className="stepper">
                  <button type="button" onClick={() => setAdjust((value) => value - 5)} disabled={share <= 0.05} aria-label="Un peu moins"><Icon name="minus" size={15} /></button>
                  <strong>{Math.round(share * 100)} %</strong>
                  <button type="button" onClick={() => setAdjust((value) => value + 5)} disabled={share >= 1} aria-label="Un peu plus"><Icon name="plus" size={15} /></button>
                </div>
                <span>{adjust > 0 ? "un peu plus" : adjust < 0 ? "un peu moins" : "du plat"}</span>
              </div>
              <div className="plate-mine">
                <span>
                  Ma part
                  <small>{carbsLabel(carbs * share)}{fat > 0 ? ` · ${Math.round(fat * share)} g de lipides` : ""}</small>
                </span>
                <strong>{Math.round(total * share)} kcal</strong>
              </div>
              {leftoverParts > 0 && !editing && !planned && (
                <label className="awake-toggle">
                  <input type="checkbox" checked={keepLeftover} onChange={(e) => setKeepLeftover(e.target.checked)} />
                  <span>Garder le reste ({leftoverParts.toLocaleString("fr-FR")} part{leftoverParts > 1 ? "s" : ""} · {Math.round(total / servings)} kcal la part) pour un prochain repas</span>
                </label>
              )}
            </section>
          )}

          {!isPlate && freshLeftovers.length > 0 && (
            <div className="food-results">
              <p className="food-section">Mes restes</p>
              {freshLeftovers.map((item) => (
                <div className="leftover-row" key={item.id}>
                  <button type="button" className="food-result" onClick={() => addLeftover(item)}>
                    <span className="food-icon source-perso"><Icon name="clock" size={16} /></span>
                    <span className="food-result-text">
                      <strong>{item.name.replace(/^Assiette maison : /, "")}</strong>
                      <small>{item.partsLeft.toLocaleString("fr-FR")} part{item.partsLeft > 1 ? "s" : ""} · préparé le {new Date(`${item.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</small>
                    </span>
                    <em>{item.kcalPerPart} kcal</em>
                  </button>
                  <button type="button" className="icon-button" onClick={() => onDiscardLeftover(item.id)} aria-label="Jeter ce reste"><Icon name="trash" size={15} /></button>
                </div>
              ))}
            </div>
          )}

          {!isPlate && myRecipes.length > 0 && (
            <div className="food-results">
              <p className="food-section">Mes recettes</p>
              {(showAllRecipes ? myRecipes : myRecipes.slice(0, 3)).map((recipe) => (
                <FoodResultRow key={`recette-${recipe.id}`} result={recipeResult(recipe)} onPick={add} />
              ))}
              {!showAllRecipes && myRecipes.length > 3 && (
                <button type="button" className="text-button food-more" onClick={() => setShowAllRecipes(true)}>Voir {myRecipes.length - 3} de plus</button>
              )}
            </div>
          )}

          {!isPlate && drinks.length > 0 && (
            <div className="drink-shortcuts">
              <p className="food-section">Boissons</p>
              <div className="drink-chips">
                {(showAllDrinks ? drinks : drinks.slice(0, 8)).map((drink) => (
                  <button type="button" key={drink.ref} onClick={() => add(drink)}>
                    <strong>{drink.name}</strong>
                    <small>{kcalLabel(drink)} · {drink.portionLabel?.replace(/^1 /, "")}</small>
                  </button>
                ))}
                {!showAllDrinks && drinks.length > 8 && (
                  <button type="button" className="drink-more" onClick={() => setShowAllDrinks(true)}><strong>+ {drinks.length - 8}</strong><small>autres</small></button>
                )}
              </div>
              {energyBrand === null ? (
                <button type="button" className="add-part" onClick={() => setEnergyBrand(energyBrands[0])}>
                  <Icon name="flame" size={15} /> Boissons énergisantes ({energyDrinks.length})
                </button>
              ) : (
                <div className="energy-list">
                  <div className="energy-head">
                    <p className="food-section">Boissons énergisantes</p>
                    <button type="button" className="icon-button" onClick={() => setEnergyBrand(null)} aria-label="Fermer la liste"><Icon name="close" size={15} /></button>
                  </div>
                  <div className="container-chips" role="radiogroup" aria-label="Marque">
                    {energyBrands.map((brand) => (
                      <button type="button" role="radio" aria-checked={brand === energyBrand} key={brand} className={brand === energyBrand ? "selected" : ""} onClick={() => setEnergyBrand(brand)}>{brand}</button>
                    ))}
                  </div>
                  {energyDrinks.filter((drink) => drink.brand === energyBrand).map((drink) => (
                    <FoodResultRow key={drink.name} result={energyResult(drink)} onPick={(food) => { add(food); setEnergyBrand(null); }} />
                  ))}
                  <small className="photo-note">Valeurs moyennes des canettes vendues en France (Open Food Facts). Le code-barres donne la valeur exacte.</small>
                </div>
              )}
            </div>
          )}
          {recents.length > 0 && (
            <div className="food-results">
              <p className="food-section">Récemment utilisés</p>
              {recents.map(resultRow)}
            </div>
          )}
          {!lines.length && !recents.length && (
            <p className="food-hint">Tapez un aliment, un plat ou un produit. Les valeurs viennent de la table officielle Ciqual (ANSES) et d'Open Food Facts pour les marques.</p>
          )}

          <button type="button" className="submit-button" onClick={save} disabled={!lines.length}>
            <Icon name="check" /> {!lines.length ? "Ajoutez au moins un aliment" : planned ? `Prévoir ce repas · ${Math.round(total * share)} kcal` : editing ? `Enregistrer les modifications · ${Math.round(total * share)} kcal` : isPlate ? `Ajouter ma part · ${Math.round(total * share)} kcal` : `Enregistrer le repas · ${Math.round(total)} kcal`}
          </button>
        </>
      )}
    </div>
  );
}

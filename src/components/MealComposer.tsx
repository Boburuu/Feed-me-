import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import MealLineEditor from "./MealLineEditor";
import {
  itemCalories,
  itemGrams,
  itemProtein,
  normalize,
  openFoodFactsPortion,
  searchCiqual,
  searchCommon,
  drinkShortcuts,
  searchOpenFoodFacts,
  searchOwn,
  toMealItem,
  type FoodResult,
} from "../lib/foods";
import { analyzeMealPhoto, photoRecognitionAvailable, scanBarcode, type PhotoAnalysis } from "../lib/foodPhoto";
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
};

type Line = MealItem & { key: number };

/** Nombre de résultats montrés avant « Voir plus » : la recherche doit rester lisible. */
const SHOWN = { common: 4, ciqual: 4, own: 3, brands: 3 };

/** Calories d'une portion quand on la connaît (« 109 kcal » pour 1 banane), sinon pour 100 g. */
const kcalLabel = (result: FoodResult) => {
  if (result.perPortionOnly) return `${Math.round(result.kcal100)} kcal`;
  if (result.portionGrams) return `${Math.round((result.kcal100 * result.portionGrams) / 100)} kcal`;
  return `${Math.round(result.kcal100)} kcal/100 g`;
};
/** « 1 banane ≈ 120 g · 91 kcal/100 g · Ciqual (ANSES) » */
const resultDetail = (result: FoodResult) => {
  const parts: string[] = [];
  if (result.perPortionOnly) parts.push("par portion");
  else if (result.portionLabel && result.portionGrams) parts.push(`${result.portionLabel} ≈ ${Math.round(result.portionGrams)} ${result.liquid ? "ml" : "g"}`, `${Math.round(result.kcal100)} kcal/100 ${result.liquid ? "ml" : "g"}`);
  parts.push(result.detail);
  return parts.join(" · ");
};
const sourceIcon = { ciqual: "apple", off: "target", recette: "book", perso: "user" } as const;
const sourceName = { ciqual: "Ciqual", off: "Open Food Facts", recette: "Ma recette", perso: "Mon aliment" } as const;
/** « 1 banane » → « banane », « 1 portion (200 ml) » → « portion ». */
const unitName = (label?: string) => (label ?? "portion").replace(/^1\s+/, "").replace(/\s*\(.*$/, "").slice(0, 14);
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function MealComposer({ date: initialDate, category: initialCategory, recipes, customFoods, meals, onSave, onCreateFood, initialPhoto, leftovers, onDiscardLeftover }: MealComposerProps) {
  const today = todayKey();
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [common, setCommon] = useState<FoodResult[]>([]);
  const [ciqual, setCiqual] = useState<FoodResult[]>([]);
  const [brands, setBrands] = useState<FoodResult[]>([]);
  const [brandState, setBrandState] = useState<"idle" | "loading" | "error" | "offline">("idle");
  const [expanded, setExpanded] = useState({ common: false, ciqual: false, own: false, brands: false, variants: false });
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState({ name: "", kcal: "", protein: "", portion: "", perPortion: false, keep: true });
  const searchInput = useRef<HTMLInputElement>(null);
  // Assiette maison : plat préparé pour plusieurs personnes, dont on mange une part.
  const [mode, setMode] = useState<"meal" | "plate">("meal");
  const [plateName, setPlateName] = useState("");
  const [servings, setServings] = useState(2);
  const [parts, setParts] = useState(1);
  /** Réglage fin, en points de pourcentage : « un peu plus » que la part. */
  const [adjust, setAdjust] = useState(0);
  const [keepLeftover, setKeepLeftover] = useState(true);
  const searching = query.trim().length > 0;
  const [drinks, setDrinks] = useState<FoodResult[]>([]);
  const [showAllDrinks, setShowAllDrinks] = useState(false);
  useEffect(() => { drinkShortcuts().then(setDrinks).catch(() => undefined); }, []);
  const photoInput = useRef<HTMLInputElement>(null);
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
  const scan = async () => {
    setScanNote("");
    try {
      const result = await scanBarcode();
      if (result.status === "found") add(result.food);
      else if (result.status === "unknown") setScanNote(`Code ${result.code} inconnu d'Open Food Facts : cherchez le produit par son nom, ou créez-le.`);
      else if (result.status === "installing") setScanNote("Installation du scanner par Android… Réessayez dans quelques secondes.");
    } catch {
      setScanNote(navigator.onLine ? "Le scan n'a pas abouti. Réessayez, bien éclairé." : "Hors connexion : le scan a besoin d'internet pour trouver le produit.");
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
    Promise.all([searchCommon(query), searchCiqual(query, 15)])
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
    setLines((current) => [...current, { ...toMealItem(result), key }]);
    setQuery("");
    // Produit de marque : on récupère la portion indiquée sur l'emballage.
    if (result.source === "off" && result.ref) {
      openFoodFactsPortion(result.ref).then((portion) => {
        if (!portion) return;
        setLines((current) => current.map((line) =>
          line.key === key ? { ...line, portionGrams: portion.grams, portionLabel: portion.label, servingGrams: portion.grams, servingLabel: portion.label, ...(line.unit === "g" && line.quantity === 100 ? { unit: "portion" as const, quantity: 1 } : {}) } : line));
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
    const portion = Number(custom.portion.replace(",", ".")) || undefined;
    const food: CustomFood = custom.perPortion
      ? { id: Date.now(), name: custom.name.trim(), kcal100: kcal, protein100: protein, portionLabel: "1 portion" }
      : { id: Date.now(), name: custom.name.trim(), kcal100: kcal, protein100: protein, portionGrams: portion, portionLabel: portion ? `1 portion (${n(portion)} g)` : undefined };
    if (custom.keep) onCreateFood(food);
    add({ ...food, source: "perso", ref: String(food.id), detail: "Mon aliment", perPortionOnly: custom.perPortion });
    setCreating(false);
    setCustom({ name: "", kcal: "", protein: "", portion: "", perPortion: false, keep: true });
  };

  const total = lines.reduce((sum, line) => sum + itemCalories(line), 0);
  const protein = Math.round(lines.reduce((sum, line) => sum + itemProtein(line), 0));

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
      date: date > today ? today : date,
      category,
      name: shortName,
      calories: Math.round(total * share),
      protein: Math.round(protein * share) || undefined,
      source: "manual",
      items,
      ...(isPlate ? { plate: { servings, share } } : {}),
    }, {
      usedLeftovers,
      leftover: isPlate && keepLeftover && leftoverParts > 0
        ? { name: shortName, date: date > today ? today : date, partsLeft: leftoverParts, kcalPerPart: Math.round(total / servings), proteinPerPart: Math.round(protein / servings) }
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
      portionLabel: "1 part",
    }]);
  };

  const resultRow = (result: FoodResult, index: number) => (
    <button type="button" className="food-result" key={`${result.source}-${result.ref ?? result.name}-${index}`} onClick={() => add(result)}>
      <span className={`food-icon source-${result.source}`}><Icon name={sourceIcon[result.source]} size={16} /></span>
      <span className="food-result-text">
        <strong>{result.name}</strong>
        <small>{resultDetail(result)}</small>
      </span>
      <em>{kcalLabel(result)}</em>
    </button>
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
      <div className="meal-composer-when">
        <label>Jour<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Moment
          <select value={category} onChange={(e) => setCategory(e.target.value as MealCategory)}>
            {mealCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

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
          <button type="button" className="add-part" onClick={scan}>
            <Icon name="target" size={16} /> Code-barres
          </button>
        </div>
      )}
      {scanNote && !searching && <p className="food-hint">{scanNote}</p>}
      <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) analyzePhoto(file); }} />

      {!searching && !creating && photo && (() => {
        const analysis = photo.analysis;
        const found = !!analysis && (!!analysis.barcode || analysis.packaging.length > 0 || analysis.dishes.length > 0);
        const pick = (food: FoodResult) => { add(food); setPhoto(null); };
        const row = (food: FoodResult, key: string, badge?: string) => (
          <button type="button" className="food-result" key={key} onClick={() => pick(food)}>
            {badge
              ? <span className="photo-score">{badge}</span>
              : <span className={`food-icon source-${food.source}`}><Icon name={sourceIcon[food.source]} size={16} /></span>}
            <span className="food-result-text"><strong>{food.name}</strong><small>{resultDetail(food)}</small></span>
            <em>{kcalLabel(food)}</em>
          </button>
        );
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
                <span>{isPlate ? "Plat entier" : "Total"}{!isPlate && protein > 0 ? ` · ${protein} g de protéines` : ""}</span>
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
                <span>Ma part</span>
                <strong>{Math.round(total * share)} kcal</strong>
              </div>
              {leftoverParts > 0 && (
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
            <Icon name="check" /> {!lines.length ? "Ajoutez au moins un aliment" : isPlate ? `Ajouter ma part · ${Math.round(total * share)} kcal` : `Enregistrer le repas · ${Math.round(total)} kcal`}
          </button>
        </>
      )}
    </div>
  );
}

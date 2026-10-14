import { useEffect, useRef, useState } from "react";
import FoodPicker from "./FoodPicker";
import Icon from "./Icon";
import MealLineEditor from "./MealLineEditor";
import { openFoodFactsPortion, toMealItem, type FoodResult } from "../lib/foods";
import { deleteImage, getImage, putImage, shrinkImage } from "../lib/images";
import { referenceFor } from "../lib/coherence";
import type { RecipeDraft } from "../lib/drafts";
import { choicesOf, matchChoice, matchIngredient } from "../lib/ingredientMatch";
import { mergeTexts, ocrAvailable, readImageText } from "../lib/ocr";
import { categoryOf, commonUnits, formatQuantity, ingredientFromItem, ingredientsNutrition, parseQuantity, recipeCategories } from "../lib/recipes";
import { parseRecipeText, summarize } from "../lib/recipeText";
import type { Ingredient, MealItem, Recipe, RecipeCategory, RecipeStep, StepGroup } from "../lib/storage";

type RecipeFormProps = {
  /** Recette à modifier ; absente pour une création. */
  initial?: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
  flash: (message: string) => void;
  /** Saisie reprise après une fermeture de l'app. */
  draft?: RecipeDraft;
  /** Chaque changement de la saisie, pour l'enregistrer comme brouillon. */
  onDraft?: (draft: RecipeDraft) => void;
  onDiscardDraft?: () => void;
};

/** Image du formulaire : déjà enregistrée (id) ou nouvelle (data URL seulement). */
type DraftImage = { id?: string; src: string };
/**
 * Ingrédient en cours de saisie. Trouvé dans les bases (`food`) : il se règle comme dans
 * un repas (+ / −, tranche, boîte, g). Écrit à la main : la quantité reste du texte (« ½ »).
 * `key` : identifiant stable de la ligne pour React.
 */
type DraftItem = { key: number; quantity: string; unit: string; name: string; food?: MealItem };
type DraftGroup = { title: string; items: DraftItem[] };

type Draft = {
  name: string;
  category: RecipeCategory;
  ingredients: DraftGroup[];
  steps: StepGroup[];
  time: string;
  portions: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  volume: string;
  notes: string;
  url: string;
  images: DraftImage[];
};

let nextKey = 1;
const emptyItem = (): DraftItem => ({ key: nextKey++, quantity: "", unit: "", name: "" });
const toDraftItem = (item: Ingredient): DraftItem => ({ key: nextKey++, quantity: item.quantity === null ? "" : formatQuantity(item.quantity), unit: item.unit, name: item.name, food: item.food });
const toIngredient = (item: DraftItem): Ingredient =>
  item.food
    ? ingredientFromItem(item.food)
    : { name: item.name.trim(), unit: item.unit.trim(), quantity: item.quantity.trim() ? parseQuantity(item.quantity.replace(",", ".")) : null };
const hasContent = (item: DraftItem) => !!item.food || !!item.name.trim();
const emptyStep = (): RecipeStep => ({ title: "", text: "" });

function draftFrom(recipe?: Recipe): Draft {
  return {
    name: recipe?.name ?? "",
    category: recipe ? categoryOf(recipe) : "plat",
    ingredients: recipe?.ingredients.length
      ? recipe.ingredients.map((group) => ({
        title: group.title,
        items: group.items.map(toDraftItem),
      }))
      : [{ title: "", items: [] }],
    steps: recipe?.steps.length ? recipe.steps : [{ title: "", steps: [emptyStep()] }],
    time: recipe ? String(recipe.time) : "",
    portions: recipe ? String(recipe.portions) : "",
    calories: recipe?.calories ? String(recipe.calories) : "",
    protein: recipe?.calories ? String(recipe.protein) : "",
    carbs: recipe?.carbs !== undefined ? String(recipe.carbs) : "",
    fat: recipe?.fat !== undefined ? String(recipe.fat) : "",
    volume: recipe?.volumeMl ? String(recipe.volumeMl) : "",
    notes: recipe?.notes ?? "",
    url: recipe?.url ?? "",
    images: [],
  };
}

const isBlank = (draft: Draft) =>
  draft.ingredients.every((group) => !group.items.some(hasContent)) &&
  draft.steps.every((group) => group.steps.every((step) => !step.text.trim() && !step.title.trim()));

export default function RecipeForm({ initial, onSave, onCancel, flash, draft: saved, onDraft, onDiscardDraft }: RecipeFormProps) {
  const [draft, setDraft] = useState<Draft>(() => (saved ? { ...saved.form, images: [] } : draftFrom(initial)));
  const [rawText, setRawText] = useState<string | null>(saved?.rawText ?? null);

  // Brouillon enregistré à chaque changement (sans les photos ajoutées, trop lourdes).
  useEffect(() => {
    const { images: _images, ...form } = draft;
    onDraft?.({ recipeId: initial?.id, form, rawText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, rawText]);
  const [reading, setReading] = useState("");
  const [importNote, setImportNote] = useState("");
  const [keepShots, setKeepShots] = useState(true);
  const [shots, setShots] = useState<string[]>([]);
  const screenshotInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  /** Partie d'ingrédients où l'on ajoute des aliments (recherche, photo, code-barres). */
  const [picking, setPicking] = useState(0);
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  // En modification, on charge les images déjà enregistrées pour les afficher.
  useEffect(() => {
    if (!initial?.images?.length) return;
    let alive = true;
    Promise.all(initial.images.map(async (id) => ({ id, src: (await getImage(id)) ?? "" }))).then((images) => {
      if (alive) setDraft((current) => ({ ...current, images: [...images.filter((image) => image.src), ...current.images] }));
    });
    return () => { alive = false; };
  }, [initial]);

  // --- Import depuis une capture ou un texte -----------------------------------------

  const readScreenshots = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    setImportNote("");
    try {
      const texts: string[] = [];
      for (const [index, file] of files.entries()) {
        setReading(files.length > 1 ? `Lecture de la capture ${index + 1} sur ${files.length}…` : "Lecture de la capture…");
        texts.push(await readImageText(file));
      }
      const text = mergeTexts(texts);
      setShots(await Promise.all(files.map((file) => shrinkImage(file))));
      setRawText(text);
      analyze(text);
    } catch (error) {
      setImportNote(error instanceof Error && error.message ? `Lecture impossible : ${error.message}` : "La capture n'a pas pu être lue.");
    } finally {
      setReading("");
    }
  };

  const analyze = (text: string) => {
    const parsed = parseRecipeText(text);
    const { ingredients, steps, parts } = summarize(parsed);
    if (!ingredients && !steps) {
      setImportNote("Aucune recette reconnue. Reprenez la capture en grand et bien nette, ou corrigez le texte lu ci-dessous puis relancez l'analyse.");
      return;
    }
    if (!isBlank(draft) && !window.confirm("Remplacer les ingrédients et les étapes déjà saisis par ceux de l'import ?")) return;
    const groups = parsed.ingredients.length ? parsed.ingredients.map((group) => ({ title: group.title, items: group.items.map(toDraftItem) })) : null;
    setDraft((current) => ({
      ...current,
      name: parsed.name || current.name,
      category: parsed.category ?? current.category,
      portions: parsed.portions ? String(parsed.portions) : current.portions,
      time: parsed.time ? String(parsed.time) : current.time,
      // Valeurs écrites dans la recette (« 339 kcal – 36 g P ») : celles de l'auteur.
      calories: parsed.calories ? String(parsed.calories) : current.calories,
      protein: parsed.protein ? String(parsed.protein) : current.protein,
      carbs: parsed.carbs !== null ? String(parsed.carbs) : current.carbs,
      fat: parsed.fat !== null ? String(parsed.fat) : current.fat,
      notes: current.notes.trim() ? current.notes : parsed.notes,
      ingredients: groups ?? current.ingredients,
      steps: parsed.steps.length ? parsed.steps : current.steps,
    }));
    const partsLabel = parts > 1 ? ` en ${parts} parties` : "";
    const values = parsed.calories ? ` Valeurs de la recette : ${parsed.calories} kcal par portion.` : "";
    setImportNote(`${ingredients} ingrédient${ingredients > 1 ? "s" : ""} et ${steps} étape${steps > 1 ? "s" : ""} trouvés${partsLabel}.${values} Vérifiez et corrigez ci-dessous avant d'enregistrer.`);
    if (groups) void matchWritten(groups);
  };

  // --- Calcul des ingrédients écrits ----------------------------------------------------------

  const [matching, setMatching] = useState(false);
  const [matchNote, setMatchNote] = useState("");
  /**
   * Retrouve dans les bases les ingrédients écrits (import ou saisie à la main) : chacun
   * devient réglable comme dans un repas, avec l'aliment retenu affiché pour vérifier.
   */
  const matchWritten = async (groups: DraftGroup[]) => {
    setMatching(true);
    setMatchNote("");
    // « Sel, poivre » (sans quantité) ne compte pas : rien à calculer.
    const written = groups.flatMap((group) => group.items).filter((item) => !item.food && item.name.trim() && toIngredient(item).quantity !== null);
    const found = new Map<number, MealItem>();
    for (const item of written) {
      const food = await matchIngredient(toIngredient(item)).catch(() => null);
      if (food) found.set(item.key, food);
    }
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((group) => ({ ...group, items: group.items.map((item) => (found.has(item.key) ? { ...item, food: found.get(item.key) } : item)) })),
    }));
    const missing = written.length - found.size;
    setMatchNote(written.length
      ? `${found.size} ingrédient${found.size > 1 ? "s" : ""} sur ${written.length} retrouvé${found.size > 1 ? "s" : ""}. Vérifiez l'aliment indiqué sous chacun${missing === 1 ? ", et cherchez le dernier avec la recherche pour un calcul complet" : missing ? `, et cherchez les ${missing} autres avec la recherche pour un calcul complet` : ""}.`
      : "");
    setMatching(false);
  };

  // --- Ingrédients -----------------------------------------------------------------------

  const setGroup = (index: number, change: Partial<DraftGroup>) =>
    set({ ingredients: draft.ingredients.map((group, i) => (i === index ? { ...group, ...change } : group)) });
  const setItem = (groupIndex: number, itemIndex: number, change: Partial<DraftItem>) =>
    setGroup(groupIndex, { items: draft.ingredients[groupIndex].items.map((item, i) => (i === itemIndex ? { ...item, ...change } : item)) });

  /** Change un ingrédient sans dépendre d'un état périmé (la portion d'Open Food Facts arrive plus tard). */
  const updateItem = (key: number, change: (item: DraftItem) => DraftItem) =>
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((group) => ({ ...group, items: group.items.map((item) => (item.key === key ? change(item) : item)) })),
    }));
  const removeItem = (key: number) =>
    setDraft((current) => ({ ...current, ingredients: current.ingredients.map((group) => ({ ...group, items: group.items.filter((item) => item.key !== key) })) }));

  /** Autre choix d'un ingrédient « au choix », au même poids. */
  const chooseAlternative = async (key: number, choice: string) => {
    const current = draft.ingredients.flatMap((group) => group.items).find((item) => item.key === key)?.food;
    if (!current || current.choice === choice) return;
    const food = await matchChoice(current, choice).catch(() => null);
    if (food) updateItem(key, (item) => ({ ...item, food }));
    else flash(`« ${choice} » introuvable : cherchez-le avec la recherche.`);
  };

  /** Aliment trouvé : il s'ajoute à la partie, réglable comme dans un repas. */
  const pickFood = (groupIndex: number, result: FoodResult) => {
    const food = toMealItem(result);
    const item: DraftItem = { key: nextKey++, quantity: "", unit: "", name: food.name, food };
    referenceFor(food).then((reference) => {
      if (reference) updateItem(item.key, (line) => (line.food ? { ...line, food: { ...line.food, ...reference } } : line));
    }).catch(() => undefined);
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((group, i) => (i === groupIndex ? { ...group, items: [...group.items.filter(hasContent), item] } : group)),
    }));
    // Produit de marque : la portion indiquée sur l'emballage arrive ensuite (comme dans un repas).
    if (result.source === "off" && /^\d+$/.test(result.ref ?? "") && !food.pieceGrams) {
      openFoodFactsPortion(result.ref!).then((portion) => {
        if (!portion) return;
        updateItem(item.key, (line) => line.food ? { ...line, food: { ...line.food, servingGrams: portion.grams, servingLabel: portion.label, ...(line.food.unit === "g" && line.food.quantity === 100 ? { unit: "portion" as const, quantity: 1, portionGrams: portion.grams, portionLabel: portion.label } : {}) } } : line);
      }).catch(() => undefined);
    }
  };

  // Calories calculées d'après les ingrédients trouvés dans les bases.
  const draftIngredients = draft.ingredients.flatMap((group) => group.items.filter(hasContent).map(toIngredient));
  const computed = ingredientsNutrition(draftIngredients);
  const portionCount = Number(draft.portions) || 2;
  const perPerson = { kcal: Math.round(computed.kcal / portionCount), protein: Math.round(computed.protein / portionCount), carbs: Math.round(computed.carbs / portionCount), fat: Math.round(computed.fat / portionCount) };

  // --- Étapes ---------------------------------------------------------------------------

  const setStepGroup = (index: number, change: Partial<StepGroup>) =>
    set({ steps: draft.steps.map((group, i) => (i === index ? { ...group, ...change } : group)) });
  const setStep = (groupIndex: number, stepIndex: number, change: Partial<RecipeStep>) =>
    setStepGroup(groupIndex, { steps: draft.steps[groupIndex].steps.map((step, i) => (i === stepIndex ? { ...step, ...change } : step)) });
  /** Nouvelle partie d'étapes : reprend le nom d'une partie d'ingrédients pas encore utilisée. */
  const addStepGroup = () => {
    const used = new Set(draft.steps.map((group) => group.title));
    const title = draft.ingredients.map((group) => group.title).find((name) => name && !used.has(name)) ?? "";
    set({ steps: [...draft.steps, { title, steps: [emptyStep()] }] });
  };

  const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    try {
      const images = await Promise.all(files.map((file) => shrinkImage(file)));
      setDraft((current) => ({ ...current, images: [...current.images, ...images.map((src) => ({ src }))] }));
    } catch {
      flash("Une des images n'a pas pu être lue");
    }
  };

  // --- Enregistrement ---------------------------------------------------------------------

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ingredients = draft.ingredients
      .map((group) => ({
        title: group.title.trim(),
        items: group.items.filter(hasContent).map(toIngredient),
      }))
      .filter((group) => group.items.length);
    const steps = draft.steps
      .map((group) => ({ title: group.title.trim(), steps: group.steps.map((step) => ({ title: step.title.trim(), text: step.text.trim() })).filter((step) => step.text || step.title) }))
      .filter((group) => group.steps.length);
    const count = ingredients.reduce((sum, group) => sum + group.items.length, 0);

    let images: string[] = [];
    try {
      const pending: DraftImage[] = [...draft.images, ...(keepShots ? shots.map((src) => ({ src })) : [])];
      images = await Promise.all(pending.map((image) => image.id ?? putImage(image.src)));
      // Images retirées pendant la modification : on libère la place.
      initial?.images?.filter((id) => !images.includes(id)).forEach((id) => deleteImage(id).catch(() => undefined));
    } catch {
      flash("Les images n'ont pas pu être enregistrées");
    }

    onSave({
      id: initial?.id ?? Date.now(),
      name: draft.name.trim(),
      category: draft.category,
      ingredients,
      steps,
      // Champs vides : calcul d'après les ingrédients retrouvés. Sans aucun : 0 = « à calculer »
      // (pas d'estimation au hasard).
      time: Number(draft.time) || Math.max(15, count * 5),
      portions: Number(draft.portions) || 2,
      calories: Number(draft.calories) || (computed.known ? perPerson.kcal : 0),
      protein: Number(draft.protein) || (computed.known ? perPerson.protein : 0),
      // Glucides : saisis (même 0), sinon calculés, sinon inconnus.
      carbs: draft.carbs.trim() ? Number(draft.carbs.replace(",", ".")) : computed.known ? perPerson.carbs : undefined,
      fat: draft.fat.trim() ? Number(draft.fat.replace(",", ".")) : computed.known ? perPerson.fat : undefined,
      volumeMl: Number(draft.volume.replace(",", ".")) || undefined,
      images,
      url: draft.url.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    });
  };

  return (
    <form className="recipe-form" onSubmit={submit}>
      {saved && (
        <div className="draft-banner" role="status">
          <span>Brouillon repris là où vous l'aviez laissé.</span>
          <button type="button" className="text-button" onClick={onDiscardDraft}>Recommencer</button>
        </div>
      )}
      {!initial && (
        <div className="import-box">
          <p className="plan-label">Importer une recette</p>
          <small className="import-note">Faites une capture d'écran de la recette (sur Instagram, un site, un livre…). L'app lit le texte et remplit les ingrédients et les étapes.</small>
          <div className="import-actions">
            <button type="button" onClick={() => screenshotInput.current?.click()} disabled={!!reading || !ocrAvailable()}>
              {reading ? <span className="loader" /> : <Icon name="camera" size={17} />} Depuis une capture
            </button>
            <button type="button" className="secondary" onClick={() => setRawText(rawText ?? "")} disabled={!!reading}>
              <Icon name="edit" size={17} /> Coller le texte
            </button>
          </div>
          {!ocrAvailable() && <small className="import-note">La lecture des captures fonctionne sur le téléphone. Sur ordinateur, collez le texte de la recette.</small>}
          <input ref={screenshotInput} className="hidden-input" type="file" accept="image/*" multiple onChange={readScreenshots} />
          {reading && <small className="import-note" role="status">{reading}</small>}
          {shots.length > 0 && (
            <div className="shot-row">
              {shots.map((src, index) => <span className="shot" key={index}><img src={src} alt={`Capture ${index + 1}`} /></span>)}
            </div>
          )}
          {shots.length > 0 && (
            <label className="awake-toggle"><input type="checkbox" checked={keepShots} onChange={(e) => setKeepShots(e.target.checked)} /><span>Garder les captures avec la recette</span></label>
          )}
          {rawText !== null && (
            <label className="raw-text">
              <span>{shots.length ? "Texte lu (corrigez-le si besoin)" : "Texte de la recette"}</span>
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder={"Collez ici la légende Instagram ou le texte de la recette :\n\nIngrédients\n200 g de farine\n…\nPréparation\n1. Mélanger…"} />
              <button type="button" className="add-button" onClick={() => analyze(rawText)} disabled={!rawText.trim()}><Icon name="check" size={15} /> Analyser le texte</button>
            </label>
          )}
          {importNote && <p className="import-result" role="status">{importNote}</p>}
        </div>
      )}

      <label><span>Nom de la recette</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Tarte au citron" required /></label>

      <div className="recipe-category-field">
        <span>Catégorie</span>
        <div className="chip-row">
          {recipeCategories.map((category) => (
            <button type="button" key={category.id} className={draft.category === category.id ? "selected" : ""} onClick={() => set({ category: category.id })} aria-pressed={draft.category === category.id}>
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <div className="recipe-fields">
        <label><span>Portions</span><div><input value={draft.portions} onChange={(e) => set({ portions: e.target.value })} type="number" placeholder="2" min="1" /><small>pers.</small></div></label>
        <label><span>Temps total</span><div><input value={draft.time} onChange={(e) => set({ time: e.target.value })} type="number" placeholder="—" min="1" /><small>min</small></div></label>
      </div>

      <section className="editor-section">
        <h3>Ingrédients</h3>
        <datalist id="unit-options">{commonUnits.map((unit) => <option key={unit} value={unit} />)}</datalist>
        {draft.ingredients.map((group, groupIndex) => (
          <div className="part-card" key={groupIndex}>
            <div className="part-head">
              <input className="part-title" value={group.title} onChange={(e) => setGroup(groupIndex, { title: e.target.value })} placeholder={draft.ingredients.length > 1 ? "Nom de la partie (ex. Garniture)" : "Partie (ex. Pâte) — facultatif"} aria-label="Nom de la partie" />
              {draft.ingredients.length > 1 && (
                <button type="button" className="icon-button" onClick={() => { set({ ingredients: draft.ingredients.filter((_, i) => i !== groupIndex) }); setPicking(0); }} aria-label="Supprimer cette partie"><Icon name="trash" size={16} /></button>
              )}
            </div>
            {(() => {
              // Les lignes de la partie : réglables comme dans un repas, ou écrites à la main.
              const lines = (group.items.length > 0 || picking !== groupIndex) && (
                <div className="ingredient-rows">
                  {group.items.map((item, itemIndex) => item.food ? (
                    <div className="ingredient-food" key={item.key}>
                      <MealLineEditor
                        line={item.food}
                        hideHydration
                        onChange={(change) => updateItem(item.key, (current) => ({ ...current, food: { ...current.food!, ...change } }))}
                        onRemove={() => removeItem(item.key)}
                      />
                      {/* « crevettes ou poulet ou tofu » : le choix compté, modifiable. */}
                      {choicesOf(item.food.name).length > 1 && (
                        <div className="container-chips choice-chips" role="radiogroup" aria-label="Au choix">
                          <small>Au choix :</small>
                          {choicesOf(item.food.name).map((choice) => {
                            const selected = (item.food!.choice ?? choicesOf(item.food!.name)[0]) === choice;
                            return (
                              <button type="button" role="radio" aria-checked={selected} key={choice} className={selected ? "selected" : ""} onClick={() => void chooseAlternative(item.key, choice)}>
                                {choice.length > 28 ? `${choice.slice(0, 27)}…` : choice}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ingredient-row" key={item.key}>
                      <input value={item.quantity} onChange={(e) => setItem(groupIndex, itemIndex, { quantity: e.target.value })} inputMode="decimal" placeholder="Qté" aria-label="Quantité" />
                      <input value={item.unit} onChange={(e) => setItem(groupIndex, itemIndex, { unit: e.target.value })} list="unit-options" placeholder="unité" aria-label="Unité" />
                      <input value={item.name} onChange={(e) => setItem(groupIndex, itemIndex, { name: e.target.value })} placeholder="Ingrédient (sel, poivre…)" aria-label="Ingrédient" />
                      <button type="button" className="icon-button" onClick={() => removeItem(item.key)} aria-label="Retirer cet ingrédient"><Icon name="close" size={15} /></button>
                    </div>
                  ))}
                </div>
              );
              const write = <button type="button" className="add-part" onClick={() => setGroup(groupIndex, { items: [...group.items, emptyItem()] })}><Icon name="edit" size={15} /> Écrire un ingrédient à la main</button>;
              return picking === groupIndex ? (
                <FoodPicker onPick={(food) => pickFood(groupIndex, food)}>
                  {lines}
                  {write}
                </FoodPicker>
              ) : (
                <>
                  {lines}
                  <button type="button" className="add-line" onClick={() => setPicking(groupIndex)}><Icon name="camera" size={15} /> Ajouter des ingrédients ici</button>
                </>
              );
            })()}
          </div>
        ))}
        <button type="button" className="add-part" onClick={() => { set({ ingredients: [...draft.ingredients, { title: "", items: [] }] }); setPicking(draft.ingredients.length); }}><Icon name="plus" size={15} /> Ajouter une partie (ex. Garniture)</button>
      </section>

      <section className="editor-section">
        <h3>Étapes</h3>
        {draft.steps.map((group, groupIndex) => (
          <div className="part-card" key={groupIndex}>
            <div className="part-head">
              <input className="part-title" value={group.title} onChange={(e) => setStepGroup(groupIndex, { title: e.target.value })} placeholder={draft.steps.length > 1 ? "Nom de la partie (ex. Garniture)" : "Partie (ex. Pâte) — facultatif"} aria-label="Nom de la partie" />
              {draft.steps.length > 1 && (
                <button type="button" className="icon-button" onClick={() => set({ steps: draft.steps.filter((_, i) => i !== groupIndex) })} aria-label="Supprimer cette partie"><Icon name="trash" size={16} /></button>
              )}
            </div>
            {group.steps.map((step, stepIndex) => (
              <div className="step-editor" key={stepIndex}>
                <div className="step-editor-head">
                  <span className="step-number">{stepIndex + 1}</span>
                  <input value={step.title} onChange={(e) => setStep(groupIndex, stepIndex, { title: e.target.value })} placeholder={`Titre de l'étape ${stepIndex + 1} (facultatif)`} aria-label={`Titre de l'étape ${stepIndex + 1}`} />
                  <button type="button" className="icon-button" onClick={() => setStepGroup(groupIndex, { steps: group.steps.filter((_, i) => i !== stepIndex) })} aria-label={`Retirer l'étape ${stepIndex + 1}`}><Icon name="close" size={15} /></button>
                </div>
                <textarea value={step.text} onChange={(e) => setStep(groupIndex, stepIndex, { text: e.target.value })} placeholder="Instructions…" aria-label={`Instructions de l'étape ${stepIndex + 1}`} />
              </div>
            ))}
            <button type="button" className="add-line" onClick={() => setStepGroup(groupIndex, { steps: [...group.steps, emptyStep()] })}><Icon name="plus" size={15} /> Ajouter une étape</button>
          </div>
        ))}
        <button type="button" className="add-part" onClick={addStepGroup}><Icon name="plus" size={15} /> Ajouter une partie (ex. Garniture)</button>
      </section>

      <div className="import-box">
        <p className="plan-label">Photos du plat</p>
        <div className="shot-row">
          {draft.images.map((image, index) => (
            <span className="shot" key={image.id ?? index}>
              <img src={image.src} alt={`Image ${index + 1}`} />
              <button type="button" onClick={() => set({ images: draft.images.filter((_, i) => i !== index) })} aria-label={`Retirer l'image ${index + 1}`}><Icon name="close" size={13} /></button>
            </span>
          ))}
          <button type="button" className="shot-add" onClick={() => photoInput.current?.click()}>
            <Icon name="camera" size={20} /><small>Ajouter</small>
          </button>
        </div>
        <input ref={photoInput} className="hidden-input" type="file" accept="image/*" multiple onChange={addPhotos} />
      </div>

      <div className="recipe-fields">
        <label><span>Calories <em>auto</em></span><div><input value={draft.calories} onChange={(e) => set({ calories: e.target.value })} type="number" placeholder="—" min="0" /><small>kcal/pers.</small></div></label>
        <label><span>Protéines <em>auto</em></span><div><input value={draft.protein} onChange={(e) => set({ protein: e.target.value })} type="number" placeholder="—" min="0" /><small>g/pers.</small></div></label>
      </div>
      <div className="recipe-fields">
        <label><span>Glucides <em>auto</em></span><div><input value={draft.carbs} onChange={(e) => set({ carbs: e.target.value })} type="number" placeholder="—" min="0" /><small>g/pers.</small></div></label>
        <label><span>Lipides <em>auto</em></span><div><input value={draft.fat} onChange={(e) => set({ fat: e.target.value })} type="number" placeholder="—" min="0" /><small>g/pers.</small></div></label>
      </div>
      <div className="recipe-fields">
        <label><span>Volume final (boisson, soupe)</span><div><input value={draft.volume} onChange={(e) => set({ volume: e.target.value })} type="number" placeholder="—" min="0" /><small>ml</small></div></label>
      </div>
      <p className="recipe-estimate-note">Volume mesuré une fois prêt : la part bue compte dans l'hydratation (600 ml pour 2 → 300 ml la part). Laissé vide, la recette n'y compte pas.</p>
      {draftIngredients.some((item) => !item.food && item.quantity !== null) && (
        <button type="button" className="add-line" onClick={() => void matchWritten(draft.ingredients)} disabled={matching}>
          {matching ? <span className="loader" /> : <Icon name="flame" size={15} />} {matching ? "Recherche des ingrédients…" : "Calculer avec les ingrédients écrits"}
        </button>
      )}
      {matchNote && <p className="import-result" role="status">{matchNote}</p>}
      {computed.known > 0 ? (
        <div className="recipe-computed">
          <p>
            <strong>≈ {perPerson.kcal} kcal par personne</strong>
            <small>{perPerson.carbs} g de glucides · {perPerson.protein} g de protéines · {perPerson.fat} g de lipides</small>
            <small>Calculé d'après {computed.known} ingrédient{computed.known > 1 ? "s" : ""} sur {draftIngredients.length}, pour {portionCount} personne{portionCount > 1 ? "s" : ""}.</small>
          </p>
          {(draft.calories !== String(perPerson.kcal) || draft.protein !== String(perPerson.protein) || draft.carbs !== String(perPerson.carbs) || draft.fat !== String(perPerson.fat)) && (
            <button type="button" className="add-line" onClick={() => set({ calories: String(perPerson.kcal), protein: String(perPerson.protein), carbs: String(perPerson.carbs), fat: String(perPerson.fat) })}><Icon name="check" size={15} /> Utiliser ces valeurs</button>
          )}
        </div>
      ) : (
        <p className="recipe-estimate-note">Calories pas encore calculées : ajoutez les ingrédients avec la recherche, la photo ou le code-barres, ou indiquez les valeurs de la recette.</p>
      )}
      <label><span>Notes</span><textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex. moins de crème, ajouter des épinards…" /></label>
      <label><span>Lien de la source (facultatif)</span><input value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.instagram.com/p/…" inputMode="url" /></label>

      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Annuler</button>
        <button className="submit-button" type="submit"><Icon name="check" /> {initial ? "Enregistrer" : "Ajouter la recette"}</button>
      </div>
    </form>
  );
}

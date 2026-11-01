import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { itemCalories } from "../lib/foods";
import { correctionKey } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";
import { toPantry } from "../lib/pantry";
import { freeName, readShare, recipeConflict, ShareError, type SharedMeal, type SharedPlanned, type SharedRecipe, type SharePayload, type ShoppingShareLine } from "../lib/share";
import type { MealItem, Recipe } from "../lib/storage";
import { companionsFor, joinNames, sameName } from "../lib/tablee";
import { useTablee } from "../lib/tableeContext";

type ShareImportProps = {
  recipes: Recipe[];
  /** Lien reçu à l'ouverture de l'app (#partage=…), lu tout de suite. */
  initialText?: string;
  onAddRecipe: (recipe: SharedRecipe) => void;
  /** Le repas s'ouvre pré-rempli dans « Ajouter un repas » : rien n'est noté sans « Enregistrer ». */
  onOpenMeal: (meal: SharedMeal & { items: MealItem[] }, as: "meal" | "plate", companions: string[]) => void;
  /** Repas prévus reçus, ajoutés au planning (« prévus »). */
  onAddPlanned: (meals: SharedPlanned[], companions: string[]) => void;
  /** Articles reçus, ajoutés à la liste de courses. */
  onAddShopping: (lines: ShoppingShareLine[]) => void;
  /** Recettes d'un carnet reçu, ajoutées au carnet (les noms déjà pris sont renommés). */
  onAddRecipes: (recipes: SharedRecipe[]) => void;
  /** Garder le repas reçu comme recette : le formulaire s'ouvre pré-rempli, tout reste modifiable. */
  onSaveAsRecipe: (meal: SharedMeal & { items: MealItem[] }) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  /** Ingrédients reçus ajoutés à « Mes ingrédients ». */
  onAddedProducts: (count: number) => void;
  onClose: () => void;
};

const mealLabels = { "petit-dejeuner": "Petit-déjeuner", dejeuner: "Déjeuner", diner: "Dîner", collation: "Collation" } as const;
const day = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

const weekDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

/** Recevoir un partage : coller le lien ou ouvrir le fichier, voir l'aperçu, puis choisir. */
export default function ShareImport({ recipes, initialText, onAddRecipe, onOpenMeal, onSaveAsRecipe, onOpenRecipe, onAddedProducts, onAddPlanned, onAddShopping, onAddRecipes, onClose }: ShareImportProps) {
  const [text, setText] = useState(initialText ?? "");
  const [shared, setShared] = useState<SharePayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const read = async (input: string) => {
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    try {
      setShared(await readShare(input));
    } catch (problem) {
      setShared(null);
      setError(problem instanceof ShareError ? problem.message : "Partage illisible.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (initialText) void read(initialText); }, [initialText]);

  const conflict = shared?.kind === "recette" ? recipeConflict(recipes, shared.recipe) : null;

  // De qui, avec qui : « Mangé avec » rempli tout seul, et la tablée complétée sur demande.
  const tablee = useTablee();
  const companions = shared ? companionsFor(shared.from, shared.guests, tablee?.me ?? []) : [];
  const unknown = companions.filter((name) => !(tablee?.tablee ?? []).some((entry) => sameName(entry, name)));
  const [tableeDone, setTableeDone] = useState(false);
  const alreadyOpened = !!shared?.id && (tablee?.received ?? []).includes(shared.id);
  /** Quelque chose a été ajouté : le lien est noté comme déjà ouvert. */
  const received = () => { if (shared?.id) tablee?.markReceived(shared.id); };
  // Cases décochées dans les listes (repas prévus, courses, carnet).
  const [off, setOff] = useState<Set<string>>(new Set());
  const flip = (key: string) => setOff((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  // Ingrédients reçus : tous cochés, sauf ceux déjà dans la liste.
  const corrections = useCorrections();
  const owned = new Set((corrections?.pantry ?? []).map(correctionKey));
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const products = shared?.kind === "ingredients" ? shared.products : [];
  const chosen = products.filter((item, index) => !owned.has(correctionKey(item)) && !unticked.has(index));
  const saveProducts = (items: MealItem[]) => {
    const start = Date.now();
    items.forEach((item, index) => corrections?.savePantry(toPantry(item, start + index)));
  };
  const addProducts = () => {
    saveProducts(chosen);
    received();
    onAddedProducts(chosen.length);
  };

  // Carnet : recettes déjà présentes (même contenu) et produits déjà dans la liste, grisés.
  const carnetRecipes = shared?.kind === "carnet" ? shared.recipes.map((recipe, index) => ({ recipe, key: `r${index}`, same: recipeConflict(recipes, recipe)?.kind === "same" })) : [];
  const carnetProducts = shared?.kind === "carnet" ? shared.products.map((item, index) => ({ item, key: `p${index}`, has: owned.has(correctionKey(item)) })) : [];
  const pickedRecipes = carnetRecipes.filter((entry) => !entry.same && !off.has(entry.key));
  const pickedProducts = carnetProducts.filter((entry) => !entry.has && !off.has(entry.key));
  const addCarnet = () => {
    if (pickedRecipes.length) onAddRecipes(pickedRecipes.map((entry) => entry.recipe));
    saveProducts(pickedProducts.map((entry) => entry.item));
    received();
    if (!pickedRecipes.length) onAddedProducts(pickedProducts.length);
  };
  const plannedChosen = shared?.kind === "semaine" ? shared.meals.filter((_, index) => !off.has(`m${index}`)) : [];
  const linesChosen = shared?.kind === "courses" ? shared.lines.filter((_, index) => !off.has(`l${index}`)) : [];
  const tick = (key: string, label: string, detail: string, disabled = false) => (
    <label className={`share-product${disabled ? " owned" : ""}`} key={key}>
      <input type="checkbox" checked={!disabled && !off.has(key)} disabled={disabled} onChange={() => flip(key)} />
      <span><strong>{label}</strong><small>{detail}</small></span>
    </label>
  );

  return (
    <div className="share-import">
      {!shared && (
        <>
          <p className="food-hint">Colle le lien reçu (ou tout le message), ou ouvre le fichier .json. Tu verras un aperçu avant d'ajouter quoi que ce soit.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="https://boburuu.github.io/Feed-me-/#partage=…" aria-label="Lien ou contenu du partage" />
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} /> Ouvrir un fichier</button>
            <button type="button" className="plan-confirm" disabled={busy || !text.trim()} onClick={() => void read(text)}><Icon name="check" size={14} /> {busy ? "Lecture…" : "Voir l'aperçu"}</button>
          </div>
          {error && <p className="meal-line-warning" role="alert">{error}</p>}
          <input ref={fileInput} className="hidden-input" type="file" accept="application/json,.json" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) file.text().then((content) => { setText(""); return read(content); }).catch(() => setError("Fichier illisible."));
          }} />
        </>
      )}

      {shared && (shared.from || alreadyOpened) && (
        <div className="share-from">
          {shared.from && <p className="food-hint">Envoyé par <strong>{shared.from}</strong>{companions.length > 1 ? ` · avec ${joinNames(companions.filter((name) => !sameName(name, shared.from!)))}` : ""}</p>}
          {alreadyOpened && <p className="meal-line-warning" role="status">Tu as déjà ouvert ce lien et ajouté son contenu. Rien n'est ajouté en double sans ton accord : vérifie avant de recommencer.</p>}
          {unknown.length > 0 && !tableeDone && (
            <button type="button" className="add-part" onClick={() => { tablee?.addToTablee(unknown); setTableeDone(true); }}>
              <Icon name="plus" size={14} /> Ajouter {joinNames(unknown)} à ma tablée
            </button>
          )}
          {tableeDone && <p className="food-hint" role="status">{joinNames(unknown)} dans ta tablée : {unknown.length > 1 ? "ils seront proposés" : "proposé·e"} dans « Mangé avec ».</p>}
        </div>
      )}

      {shared?.kind === "recette" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">Recette partagée{day(shared.sharedAt) ? ` le ${day(shared.sharedAt)}` : ""}</p>
            <h3>{shared.recipe.name}</h3>
            <p className="share-preview-facts">
              {shared.recipe.portions} pers. · {shared.recipe.calories ? `${shared.recipe.calories} kcal / pers.` : "calories à calculer"}
              {shared.recipe.carbs !== undefined ? ` · ${shared.recipe.carbs} g de glucides` : ""}
              {shared.recipe.time ? ` · ${shared.recipe.time} min` : ""}
            </p>
            <ul>
              {shared.recipe.ingredients.flatMap((group) => group.items).slice(0, 8).map((item, index) => (
                <li key={index}>{item.quantity !== null ? `${item.quantity} ${item.unit} ` : ""}{item.name}</li>
              ))}
            </ul>
            {shared.recipe.ingredients.flatMap((group) => group.items).length > 8 && <small>… et {shared.recipe.ingredients.flatMap((group) => group.items).length - 8} autres ingrédients</small>}
            <small>{shared.recipe.steps.flatMap((group) => group.steps).length} étape(s){shared.recipe.url ? " · lien vers la recette d'origine" : ""}</small>
          </article>
          {conflict?.kind === "same" ? (
            <>
              <p className="label-verdict ok">Cette recette est déjà dans ton carnet : rien à ajouter.</p>
              <div className="barcode-actions">
                <button type="button" className="text-button" onClick={onClose}>Fermer</button>
                <button type="button" className="plan-confirm" onClick={() => onOpenRecipe(conflict.recipe)}><Icon name="book" size={14} /> Voir ma recette</button>
              </div>
            </>
          ) : (
            <>
              {conflict?.kind === "name" && <p className="food-hint">Tu as déjà une recette « {conflict.recipe.name} », différente : celle-ci sera ajoutée sous le nom « {freeName(recipes, shared.recipe.name)} ».</p>}
              <div className="barcode-actions">
                <button type="button" className="text-button" onClick={onClose}>Ne pas l'ajouter</button>
                <button type="button" className="plan-confirm" onClick={() => { received(); onAddRecipe(conflict ? { ...shared.recipe, name: freeName(recipes, shared.recipe.name) } : shared.recipe); }}>
                  <Icon name="plus" size={14} /> Ajouter à mon carnet
                </button>
              </div>
            </>
          )}
        </>
      )}

      {shared?.kind === "repas" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">{shared.meal.plate ? "Assiette partagée" : "Repas partagé"}{day(shared.sharedAt) ? ` le ${day(shared.sharedAt)}` : ""}</p>
            <h3>{shared.meal.name}</h3>
            <ul>
              {shared.meal.items.map((item, index) => <li key={index}>{item.name} <b>{Math.round(itemCalories(item))} kcal</b></li>)}
            </ul>
            <p className="share-preview-facts">
              {mealLabels[shared.meal.category]} · {shared.meal.plate
                ? `plat pour ${shared.meal.plate.servings} pers., part mangée ${Math.round(shared.meal.plate.share * 100)} %`
                : `${Math.round(shared.meal.items.reduce((sum, item) => sum + itemCalories(item), 0))} kcal au total`}
            </p>
          </article>
          <p className="food-hint">Comment veux-tu l'ajouter ? Rien n'est enregistré avant que tu valides : tu pourras tout changer (quantités, grammes, parts, jour, nom…).</p>
          <div className="share-choices">
            <button type="button" className="share-choice" onClick={() => { received(); onOpenMeal(shared.meal, "meal", companions); }}>
              <Icon name="apple" size={18} /><span><strong>Comme repas</strong><small>{shared.meal.plate ? "La part mangée, aliment par aliment." : "Les aliments et leurs quantités."} Tu ajustes ta quantité.</small></span>
            </button>
            <button type="button" className="share-choice" onClick={() => { received(); onOpenMeal(shared.meal, "plate", companions); }}>
              <Icon name="flame" size={18} /><span><strong>En assiette maison</strong><small>Le plat entier : tu choisis pour combien de personnes et ta part.</small></span>
            </button>
            <button type="button" className="share-choice" onClick={() => { received(); onSaveAsRecipe(shared.meal); }}>
              <Icon name="book" size={18} /><span><strong>Dans mes recettes</strong><small>Pour le refaire : nom, parts, poids, ingrédients et étapes modifiables.</small></span>
            </button>
          </div>
          <button type="button" className="text-button" onClick={onClose}>Ne pas l'ajouter</button>
        </>
      )}

      {shared?.kind === "semaine" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">{shared.meals.length} repas prévu{shared.meals.length > 1 ? "s" : ""}{shared.from ? ` par ${shared.from}` : ""}</p>
            <div className="share-products">
              {shared.meals.map((meal, index) => tick(`m${index}`, meal.name, `${weekDay(meal.date)} · ${mealLabels[meal.category]} · ${meal.calories} kcal${meal.plate ? ` · plat pour ${meal.plate.servings}` : ""}`))}
            </div>
          </article>
          <p className="food-hint">Ils arrivent dans ton planning comme « prévus » : rien ne compte avant « Mangé », et tu pourras changer ta quantité à ce moment-là.{companions.length ? ` « Mangé avec ${joinNames(companions)} » est déjà rempli.` : ""}</p>
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={onClose}>Ne pas les ajouter</button>
            <button type="button" className="plan-confirm" disabled={!plannedChosen.length} onClick={() => { received(); onAddPlanned(plannedChosen, companions); }}><Icon name="plus" size={14} /> Ajouter {plannedChosen.length} au planning</button>
          </div>
        </>
      )}

      {shared?.kind === "courses" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">Liste de courses{shared.from ? ` de ${shared.from}` : ""}</p>
            <div className="share-products">
              {shared.lines.map((line, index) => tick(`l${index}`, line.name, line.qty || "quantité libre"))}
            </div>
          </article>
          <p className="food-hint">Les articles cochés s'ajoutent à ta liste de courses (Suivi › Semaine › Liste de courses).</p>
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={onClose}>Ne pas les ajouter</button>
            <button type="button" className="plan-confirm" disabled={!linesChosen.length} onClick={() => { received(); onAddShopping(linesChosen); }}><Icon name="plus" size={14} /> Ajouter {linesChosen.length} article{linesChosen.length > 1 ? "s" : ""}</button>
          </div>
        </>
      )}

      {shared?.kind === "carnet" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">{shared.from ? `Le carnet de ${shared.from}` : "Carnet partagé"}</p>
            {carnetRecipes.length > 0 && <h3>Recettes</h3>}
            <div className="share-products">
              {carnetRecipes.map(({ recipe, key, same }) => tick(key, recipe.name, same ? "déjà dans ton carnet" : `${recipe.portions} pers.${recipe.calories ? ` · ${recipe.calories} kcal / pers.` : ""}`, same))}
            </div>
            {carnetProducts.length > 0 && <h3>Ingrédients</h3>}
            <div className="share-products">
              {carnetProducts.map(({ item, key, has }) => tick(key, item.name, has ? "déjà dans ta liste" : `${Math.round(item.kcal100)} kcal/100 ${item.liquid ? "ml" : "g"}`, has))}
            </div>
          </article>
          <p className="food-hint">Rien n'est ajouté en double : ce que tu as déjà est grisé. Une recette différente mais du même nom est renommée « (2) ».</p>
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={onClose}>Ne rien ajouter</button>
            <button type="button" className="plan-confirm" disabled={!pickedRecipes.length && !pickedProducts.length} onClick={addCarnet}>
              <Icon name="plus" size={14} /> {pickedRecipes.length + pickedProducts.length ? `Ajouter ${pickedRecipes.length + pickedProducts.length} élément${pickedRecipes.length + pickedProducts.length > 1 ? "s" : ""}` : "Tout est déjà chez toi"}
            </button>
          </div>
        </>
      )}

      {shared?.kind === "ingredients" && (
        <>
          <article className="share-preview">
            <p className="eyebrow">{products.length > 1 ? `${products.length} ingrédients partagés` : "Ingrédient partagé"}{day(shared.sharedAt) ? ` le ${day(shared.sharedAt)}` : ""}</p>
            <div className="share-products">
              {products.map((item, index) => {
                const has = owned.has(correctionKey(item));
                const how = item.pieceGrams ? `${item.pieceLabel ?? "1 pièce"} = ${Math.round(item.pieceGrams)} g` : item.packageGrams ? `paquet de ${Math.round(item.packageGrams)} g` : "en grammes";
                return (
                  <label className={`share-product${has ? " owned" : ""}`} key={index}>
                    <input type="checkbox" checked={!has && !unticked.has(index)} disabled={has} onChange={() => setUnticked((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
                    <span><strong>{item.name}</strong><small>{Math.round(item.kcal100)} kcal/100 {item.liquid ? "ml" : "g"} · {how}{has ? " · déjà dans ta liste" : ""}</small></span>
                  </label>
                );
              })}
            </div>
          </article>
          <p className="food-hint">Ils vont dans « Mes ingrédients » (bouton + › Mes ingrédients), avec leurs valeurs et leur tranche ou paquet. Rien n'est ajouté à tes repas.</p>
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={onClose}>Ne pas les ajouter</button>
            <button type="button" className="plan-confirm" disabled={!chosen.length} onClick={addProducts}><Icon name="plus" size={14} /> {chosen.length ? `Ajouter ${chosen.length} à mes ingrédients` : "Déjà tous dans ta liste"}</button>
          </div>
        </>
      )}
    </div>
  );
}

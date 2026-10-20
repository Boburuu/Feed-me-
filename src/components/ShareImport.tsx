import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { itemCalories } from "../lib/foods";
import { freeName, readShare, recipeConflict, ShareError, type SharedMeal, type SharedRecipe, type SharePayload } from "../lib/share";
import type { MealItem, Recipe } from "../lib/storage";

type ShareImportProps = {
  recipes: Recipe[];
  /** Lien reçu à l'ouverture de l'app (#partage=…), lu tout de suite. */
  initialText?: string;
  onAddRecipe: (recipe: SharedRecipe) => void;
  /** Le repas s'ouvre pré-rempli dans « Ajouter un repas » : rien n'est noté sans « Enregistrer ». */
  onOpenMeal: (meal: SharedMeal & { items: MealItem[] }, as: "meal" | "plate") => void;
  /** Garder le repas reçu comme recette : le formulaire s'ouvre pré-rempli, tout reste modifiable. */
  onSaveAsRecipe: (meal: SharedMeal & { items: MealItem[] }) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onClose: () => void;
};

const mealLabels = { "petit-dejeuner": "Petit-déjeuner", dejeuner: "Déjeuner", diner: "Dîner", collation: "Collation" } as const;
const day = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); };

/** Recevoir un partage : coller le lien ou ouvrir le fichier, voir l'aperçu, puis choisir. */
export default function ShareImport({ recipes, initialText, onAddRecipe, onOpenMeal, onSaveAsRecipe, onOpenRecipe, onClose }: ShareImportProps) {
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
                <button type="button" className="plan-confirm" onClick={() => onAddRecipe(conflict ? { ...shared.recipe, name: freeName(recipes, shared.recipe.name) } : shared.recipe)}>
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
            <button type="button" className="share-choice" onClick={() => onOpenMeal(shared.meal, "meal")}>
              <Icon name="apple" size={18} /><span><strong>Comme repas</strong><small>{shared.meal.plate ? "La part mangée, aliment par aliment." : "Les aliments et leurs quantités."} Tu ajustes ta quantité.</small></span>
            </button>
            <button type="button" className="share-choice" onClick={() => onOpenMeal(shared.meal, "plate")}>
              <Icon name="flame" size={18} /><span><strong>En assiette maison</strong><small>Le plat entier : tu choisis pour combien de personnes et ta part.</small></span>
            </button>
            <button type="button" className="share-choice" onClick={() => onSaveAsRecipe(shared.meal)}>
              <Icon name="book" size={18} /><span><strong>Dans mes recettes</strong><small>Pour le refaire : nom, parts, poids, ingrédients et étapes modifiables.</small></span>
            </button>
          </div>
          <button type="button" className="text-button" onClick={onClose}>Ne pas l'ajouter</button>
        </>
      )}
    </div>
  );
}

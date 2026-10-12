import { useEffect, useState } from "react";
import Icon from "./Icon";
import StoredImage from "./StoredImage";
import { allIngredients, categoryLabel, categoryOf, formatIngredient } from "../lib/recipes";
import type { Recipe } from "../lib/storage";

type RecipeDetailProps = {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToJournal: () => void;
};

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

type WakeLock = { release: () => Promise<void> };

/** Garde l'écran allumé pendant qu'on cuisine (si le téléphone le permet). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } }).wakeLock;
    if (!active || !api) return;
    let lock: WakeLock | null = null;
    let alive = true;
    const request = () => api.request("screen").then((value) => { if (alive) lock = value; else value.release(); }).catch(() => undefined);
    request();
    // Le verrou saute quand l'app passe en arrière-plan : on le reprend au retour.
    const onVisible = () => { if (!document.hidden) request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export default function RecipeDetail({ recipe, onClose, onEdit, onDelete, onAddToJournal }: RecipeDetailProps) {
  const [portions, setPortions] = useState(recipe.portions);
  // Clés « partie-ligne » des ingrédients cochés et des étapes faites.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [awake, setAwake] = useState(true);
  useWakeLock(awake);

  const factor = portions / recipe.portions;
  const ingredientCount = allIngredients(recipe).length;
  const stepKeys = recipe.steps.flatMap((group, g) => group.steps.map((_, s) => `${g}-${s}`));
  const currentStep = stepKeys.find((key) => !doneSteps.has(key));
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div className="recipe-detail" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <header className="recipe-detail-bar">
        <button className="modal-close" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        <span>
          <button className="icon-button" onClick={onEdit} aria-label="Modifier la recette"><Icon name="edit" size={18} /></button>
          <button className="icon-button" onClick={onDelete} aria-label="Supprimer la recette"><Icon name="trash" size={18} /></button>
        </span>
      </header>

      <div className="recipe-detail-scroll">
        {recipe.images?.length ? (
          <div className="recipe-detail-images">
            {recipe.images.map((id, index) => <StoredImage key={id} id={id} alt={`Image ${index + 1} de ${recipe.name}`} />)}
          </div>
        ) : null}

        <p className="eyebrow">{categoryLabel(categoryOf(recipe))}</p>
        <h2>{recipe.name}</h2>
        <div className="recipe-detail-meta">
          <span><Icon name="clock" size={15} /> {recipe.time} min</span>
          <span><Icon name="flame" size={15} /> {recipe.calories} kcal / pers.</span>
          <span><Icon name="target" size={15} /> {recipe.protein} g prot. / pers.</span>
        </div>

        <section className="recipe-detail-section">
          <div className="recipe-detail-heading">
            <h3>Ingrédients</h3>
            <div className="portion-stepper" aria-label="Nombre de portions">
              <button type="button" onClick={() => setPortions((value) => Math.max(1, value - 1))} disabled={portions <= 1} aria-label="Une portion de moins"><Icon name="minus" size={16} /></button>
              <strong>{portions} pers.</strong>
              <button type="button" onClick={() => setPortions((value) => Math.min(30, value + 1))} aria-label="Une portion de plus"><Icon name="plus" size={16} /></button>
            </div>
          </div>
          {factor !== 1 && <p className="recipe-detail-hint">Quantités recalculées pour {portions} personne{portions > 1 ? "s" : ""}.</p>}
          {ingredientCount ? recipe.ingredients.map((group, g) => (
            <div className="recipe-part" key={g}>
              {group.title && <h4>{group.title}</h4>}
              <ul className="ingredient-list">
                {group.items.map((item, i) => {
                  const key = `${g}-${i}`;
                  return (
                    <li key={key}>
                      <button type="button" className={checked.has(key) ? "done" : ""} onClick={() => setChecked((set) => toggle(set, key))} aria-pressed={checked.has(key)}>
                        <span className="check-circle">{checked.has(key) && <Icon name="check" size={14} />}</span>
                        <span>{formatIngredient(item, factor)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )) : (
            <p className="recipe-detail-empty">Aucun ingrédient noté. <button className="text-button" onClick={onEdit}>Les ajouter</button></p>
          )}
        </section>

        <section className="recipe-detail-section">
          <div className="recipe-detail-heading">
            <h3>Préparation</h3>
            {stepKeys.length > 0 && <small>{doneSteps.size}/{stepKeys.length} étapes</small>}
          </div>
          {stepKeys.length ? recipe.steps.map((group, g) => (
            <div className="recipe-part" key={g}>
              {group.title && <h4>{group.title}</h4>}
              <ol className="step-list">
                {group.steps.map((step, s) => {
                  const key = `${g}-${s}`;
                  return (
                    <li key={key}>
                      <button type="button" className={`${doneSteps.has(key) ? "done" : ""} ${key === currentStep ? "current" : ""}`} onClick={() => setDoneSteps((set) => toggle(set, key))} aria-pressed={doneSteps.has(key)}>
                        <span className="step-number">{doneSteps.has(key) ? <Icon name="check" size={14} /> : s + 1}</span>
                        <span>
                          <strong className="step-title">{step.title || `Étape ${s + 1}`}</strong>
                          {step.text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )) : (
            <p className="recipe-detail-empty">Aucune étape notée. <button className="text-button" onClick={onEdit}>Les ajouter</button></p>
          )}
          {stepKeys.length > 0 && !currentStep && <p className="recipe-detail-done">Bon appétit !</p>}
        </section>

        {recipe.notes && (
          <section className="recipe-detail-section">
            <h3>Notes</h3>
            <p className="recipe-detail-notes">{recipe.notes}</p>
          </section>
        )}
        {recipe.url && <a className="recipe-link" href={recipe.url} target="_blank" rel="noreferrer">Voir la recette sur {hostOf(recipe.url)}</a>}

        <label className="awake-toggle">
          <input type="checkbox" checked={awake} onChange={(e) => setAwake(e.target.checked)} />
          <span>Garder l'écran allumé pendant la recette</span>
        </label>
      </div>

      <footer className="recipe-detail-footer">
        <button className="submit-button" onClick={onAddToJournal}><Icon name="plus" size={18} /> J'en mange une portion ({recipe.calories} kcal)</button>
      </footer>
    </div>
  );
}

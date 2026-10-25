import { useEffect, useState } from "react";
import { mealsWithRecipe, recalculatedRecipe, updateMealsWithRecipe } from "../lib/recipeNutrition";
import Icon from "./Icon";
import RecipeDetail from "./RecipeDetail";
import RecipeForm from "./RecipeForm";
import PantryPanel from "./PantryPanel";
import StoredImage from "./StoredImage";
import { recipeDraft, type RecipeDraft } from "../lib/drafts";
import { deleteImage } from "../lib/images";
import { applyChoice } from "../lib/recipeChoice";
import { allSteps, categoryLabel, categoryOf, ingredientSummary, recipeCategories } from "../lib/recipes";
import type { AppData, Meal, Recipe, RecipeCategory } from "../lib/storage";

type RecipesTabProps = {
  recipes: Recipe[];
  /** Repas notés : ceux faits avec une recette modifiée peuvent être mis à jour. */
  meals: Meal[];
  /** Recette pré-remplie (repas reçu en partage) à vérifier avant de l'enregistrer. */
  prefill?: Recipe | null;
  onPrefillUsed?: () => void;
  update: (change: (data: AppData) => AppData) => void;
  onAddToJournal: (recipe: Recipe) => void;
  flash: (message: string) => void;
  /** Recevoir un partage (lien ou fichier). */
  onReceive: () => void;
  /** Recette à ouvrir tout de suite (partage déjà dans le carnet, ou tout juste ajouté). */
  focusRecipeId?: number | null;
};

/** Ignore la casse et les accents : « creme » trouve « Crème ». */
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function RecipesTab({ recipes, meals, prefill, onPrefillUsed, update, onAddToJournal, flash, onReceive, focusRecipeId }: RecipesTabProps) {
  const [filter, setFilter] = useState<RecipeCategory | "toutes">("toutes");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"recettes" | "ingredients">("recettes");
  // Recette en cours de saisie quand l'app a été fermée : le formulaire se rouvre avec elle.
  const [startDraft] = useState(() => recipeDraft.load());
  const [creating, setCreating] = useState(!!startDraft && !startDraft.recipeId);
  const [editingId, setEditingId] = useState<number | null>(startDraft?.recipeId ?? null);
  const [restored, setRestored] = useState<RecipeDraft | null>(startDraft);
  const [formKey, setFormKey] = useState(0);
  // Repas reçu gardé comme recette : le formulaire s'ouvre avec, rien n'est ajouté avant « Enregistrer ».
  const [prefilled, setPrefilled] = useState<Recipe | null>(null);
  useEffect(() => { if (prefill) { setPrefilled(prefill); onPrefillUsed?.(); } }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeForm = () => { recipeDraft.clear(); setRestored(null); setCreating(false); setEditingId(null); setPrefilled(null); };
  const [openId, setOpenId] = useState<number | null>(focusRecipeId ?? null);
  useEffect(() => { if (focusRecipeId) setOpenId(focusRecipeId); }, [focusRecipeId]);
  /** Sélection de plusieurs recettes à supprimer (null : mode normal). */
  const [selection, setSelection] = useState<Set<number> | null>(null);

  const opened = recipes.find((recipe) => recipe.id === openId) ?? null;
  const editing = recipes.find((recipe) => recipe.id === editingId) ?? null;
  const counts = recipes.reduce<Record<string, number>>((all, recipe) => {
    const category = categoryOf(recipe);
    all[category] = (all[category] ?? 0) + 1;
    return all;
  }, {});
  const query = normalize(search.trim());
  const visible = recipes.filter((recipe) =>
    (filter === "toutes" || categoryOf(recipe) === filter) &&
    (!query || normalize(`${recipe.name} ${ingredientSummary(recipe)}`).includes(query)));

  /** Valeurs de la recette changées : proposer (sans l'imposer) de mettre à jour les repas déjà notés. */
  const offerPastMeals = (recipe: Recipe) => {
    const past = mealsWithRecipe(meals, recipe);
    if (!past.length) return;
    const example = past[0];
    const after = updateMealsWithRecipe({ meals: [example] } as AppData, recipe).meals[0];
    if (window.confirm(`${past.length} repas déjà noté${past.length > 1 ? "s" : ""} avec « ${recipe.name} » (ex. le ${new Date(`${example.date}T12:00:00`).toLocaleDateString("fr-FR")} : ${example.calories} → ${after.calories} kcal). Les mettre à jour avec les nouvelles valeurs ?`)) {
      update((current) => updateMealsWithRecipe(current, recipe));
      flash(`${past.length} repas mis à jour`);
    }
  };

  /** Fiche recalculée d'après ses ingrédients (bouton de la fiche). */
  const recalculate = (recipe: Recipe) => {
    const next = recalculatedRecipe(recipe);
    update((current) => ({ ...current, recipes: current.recipes.map((item) => (item.id === next.id ? next : item)) }));
    flash(`${next.name} : ${next.calories} kcal / pers.`);
    offerPastMeals(next);
  };

  const save = (recipe: Recipe) => {
    update((current) => ({
      ...current,
      recipes: current.recipes.some((item) => item.id === recipe.id)
        ? current.recipes.map((item) => (item.id === recipe.id ? recipe : item))
        : [recipe, ...current.recipes],
    }));
    flash(editingId ? "Recette modifiée" : "Recette ajoutée");
    if (editingId) offerPastMeals(recipe);
    recipeDraft.clear();
    setRestored(null);
    setCreating(false);
    setEditingId(null);
    setPrefilled(null);
    setOpenId(recipe.id);
  };

  const remove = (recipe: Recipe) => {
    if (!window.confirm(`Supprimer la recette « ${recipe.name} » ?`)) return;
    recipe.images?.forEach((id) => deleteImage(id).catch(() => undefined));
    update((current) => ({ ...current, recipes: current.recipes.filter((item) => item.id !== recipe.id) }));
    setOpenId(null);
  };

  const toggle = (id: number) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = () => {
    const chosen = recipes.filter((recipe) => selection?.has(recipe.id));
    if (!chosen.length) return;
    const names = chosen.length <= 3 ? ` (${chosen.map((recipe) => recipe.name).join(", ")})` : "";
    if (!window.confirm(`Supprimer ${chosen.length} recette${chosen.length > 1 ? "s" : ""}${names} ? Cette action est définitive.`)) return;
    chosen.forEach((recipe) => recipe.images?.forEach((id) => deleteImage(id).catch(() => undefined)));
    const ids = new Set(chosen.map((recipe) => recipe.id));
    update((current) => ({ ...current, recipes: current.recipes.filter((item) => !ids.has(item.id)) }));
    flash(`${chosen.length} recette${chosen.length > 1 ? "s" : ""} supprimée${chosen.length > 1 ? "s" : ""}`);
    setSelection(null);
  };

  if (creating || editing || prefilled) {
    return (
      <div className="content page-content">
        <section className="page-heading recipe-heading">
          <p className="eyebrow">Mon carnet</p>
          <h2>{editing ? "Modifier la recette" : prefilled ? "Recette reçue en partage" : "Nouvelle recette"}</h2>
          {prefilled && <p>Vérifie et modifie tout ce que tu veux (nom, parts, poids, quantités, étapes), puis enregistre. Rien n'est ajouté avant.</p>}
          {!editing && !prefilled && <p>Importez une capture d'écran (Instagram, site, livre…), collez le texte, ou écrivez-la vous-même.</p>}
        </section>
        <RecipeForm
          key={`${editing?.id ?? prefilled?.id ?? "new"}-${formKey}`}
          initial={editing ?? prefilled ?? undefined}
          onSave={save}
          onCancel={closeForm}
          draft={restored ?? undefined}
          onDraft={recipeDraft.save}
          onDiscardDraft={() => { recipeDraft.clear(); setRestored(null); setFormKey((value) => value + 1); }}
          flash={flash}
        />
      </div>
    );
  }

  return (
    <div className="content page-content">
      <section className="page-heading recipe-heading">
        <span className="large-icon blue-icon"><Icon name="book" size={25} /></span>
        <p className="eyebrow">Mon carnet</p>
        <h2>{view === "recettes" ? "Mes recettes" : "Mes ingrédients"}</h2>
        {view === "recettes" && <p>Vos recettes à cuisiner : ingrédients, étapes, et ajout au journal en un geste.</p>}
      </section>

      {/* Le carnet : les recettes, et la liste rapide des produits gardés. */}
      <div className="sex-selector carnet-view" role="tablist" aria-label="Mon carnet">
        <button type="button" role="tab" aria-selected={view === "recettes"} className={view === "recettes" ? "selected" : ""} onClick={() => setView("recettes")}>Mes recettes</button>
        <button type="button" role="tab" aria-selected={view === "ingredients"} className={view === "ingredients" ? "selected" : ""} onClick={() => setView("ingredients")}>Mes ingrédients</button>
      </div>
      {view === "ingredients" && <PantryPanel flash={flash} />}
      {view === "recettes" && (<>

      <button className="create-recipe" onClick={() => setCreating(true)}>
        <span><Icon name="plus" /></span>
        <div><strong>Ajouter une recette</strong><small>Depuis une capture d'écran, un texte ou à la main</small></div>
        <Icon name="chevron" size={18} />
      </button>

      <button className="create-recipe receive-share" onClick={onReceive}>
        <span><Icon name="link" /></span>
        <div><strong>Recevoir un partage</strong><small>Coller le lien ou ouvrir le fichier reçu</small></div>
        <Icon name="chevron" size={18} />
      </button>

      <div className="recipe-search">
        <Icon name="book" size={17} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher une recette ou un ingrédient" aria-label="Chercher une recette" type="search" />
      </div>

      <div className="category-tabs" role="tablist" aria-label="Catégories de recettes">
        <button role="tab" aria-selected={filter === "toutes"} className={filter === "toutes" ? "selected" : ""} onClick={() => setFilter("toutes")}>
          Toutes <small>{recipes.length}</small>
        </button>
        {recipeCategories.filter((category) => counts[category.id] || filter === category.id).map((category) => (
          <button role="tab" key={category.id} aria-selected={filter === category.id} className={filter === category.id ? "selected" : ""} onClick={() => setFilter(category.id)}>
            {category.plural} <small>{counts[category.id] ?? 0}</small>
          </button>
        ))}
      </div>

      {recipes.length > 0 && (
        <div className="recipe-select-bar">
          {selection === null ? (
            <button type="button" className="text-button" onClick={() => setSelection(new Set())}><Icon name="check" size={15} /> Sélectionner</button>
          ) : (
            <>
              <button type="button" className="text-button" onClick={() => setSelection(new Set(visible.map((recipe) => recipe.id)))}>Tout sélectionner</button>
              <button type="button" className="text-button" onClick={() => setSelection(null)}>Annuler</button>
            </>
          )}
        </div>
      )}

      <section className="recipe-section">
        {visible.length === 0 && (
          <p className="recipe-empty">
            {recipes.length === 0 ? "Aucune recette pour l'instant." : query ? "Aucune recette ne correspond à cette recherche." : `Aucune recette dans « ${categoryLabel(filter as RecipeCategory)} ».`}
          </p>
        )}
        <div className="recipe-list">
          {visible.map((recipe, index) => (
            <article className={`recipe-card${selection?.has(recipe.id) ? " picked" : ""}`} key={recipe.id}>
              {selection === null
                ? <button className="recipe-card-open" onClick={() => setOpenId(recipe.id)} aria-label={`Ouvrir la recette ${recipe.name}`} />
                : <button className="recipe-card-open" onClick={() => toggle(recipe.id)} aria-pressed={selection.has(recipe.id)} aria-label={`Sélectionner ${recipe.name}`} />}
              {recipe.images?.length ? (
                <div className="recipe-visual recipe-photo">
                  <StoredImage id={recipe.images[0]} alt="" />
                  <span>{recipe.calories || "?"}<small>kcal</small></span>
                </div>
              ) : (
                <div className={`recipe-visual recipe-${index % 3}`}>
                  <Icon name={recipeCategories.find((item) => item.id === categoryOf(recipe))?.icon ?? "book"} size={28} />
                  <span>{recipe.calories || "?"}<small>kcal</small></span>
                </div>
              )}
              <div className="recipe-body">
                <p className="recipe-category">{categoryLabel(categoryOf(recipe))}</p>
                <h3>{recipe.name}</h3>
                <p>{ingredientSummary(recipe)}</p>
                <div className="recipe-meta">
                  <span><Icon name="clock" size={14} /> {recipe.time} min</span>
                  <span><Icon name="users" size={14} /> {recipe.portions} pers.</span>
                  {recipe.carbs !== undefined && <span><Icon name="apple" size={14} /> {recipe.carbs} g gluc.</span>}
                  <span><Icon name="check" size={14} /> {allSteps(recipe).length ? `${allSteps(recipe).length} étapes` : "sans étapes"}</span>
                </div>
              </div>
              <div className="recipe-actions">
                {selection === null
                  ? <button className="recipe-add" onClick={() => onAddToJournal(recipe)} aria-label={`Ajouter ${recipe.name} à mes repas`}><Icon name="plus" size={17} /></button>
                  : <span className={`recipe-check${selection.has(recipe.id) ? " on" : ""}`} aria-hidden="true">{selection.has(recipe.id) && <Icon name="check" size={16} />}</span>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {selection !== null && (
        <div className="recipe-delete-bar">
          <button type="button" className="submit-button danger" onClick={removeSelected} disabled={!selection.size}>
            <Icon name="trash" size={17} /> {selection.size ? `Supprimer ${selection.size} recette${selection.size > 1 ? "s" : ""}` : "Touchez les recettes à supprimer"}
          </button>
        </div>
      )}

      {opened && (
        <RecipeDetail
          recipe={opened}
          onClose={() => setOpenId(null)}
          onEdit={() => { setOpenId(null); setEditingId(opened.id); }}
          onDelete={() => remove(opened)}
          onRecalculate={() => recalculate(opened)}
          onAddToJournal={() => { setOpenId(null); onAddToJournal(opened); }}
          onChoose={(group, index, choice) => {
            applyChoice(opened, group, index, choice).then((next) => {
              if (!next) { flash(`« ${choice} » introuvable : modifiez la recette pour le chercher.`); return; }
              update((current) => ({ ...current, recipes: current.recipes.map((item) => (item.id === next.id ? next : item)) }));
              flash(`${choice} : ${next.calories} kcal / pers.`);
            }).catch(() => flash("Le changement n'a pas pu être calculé"));
          }}
        />
      )}
      </>)}
    </div>
  );
}

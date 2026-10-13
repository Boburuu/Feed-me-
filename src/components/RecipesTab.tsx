import { useState } from "react";
import Icon from "./Icon";
import RecipeDetail from "./RecipeDetail";
import RecipeForm from "./RecipeForm";
import StoredImage from "./StoredImage";
import { deleteImage } from "../lib/images";
import { allSteps, categoryLabel, categoryOf, ingredientSummary, recipeCategories } from "../lib/recipes";
import type { AppData, Recipe, RecipeCategory } from "../lib/storage";

type RecipesTabProps = {
  recipes: Recipe[];
  update: (change: (data: AppData) => AppData) => void;
  onAddToJournal: (recipe: Recipe) => void;
  flash: (message: string) => void;
};

/** Ignore la casse et les accents : « creme » trouve « Crème ». */
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function RecipesTab({ recipes, update, onAddToJournal, flash }: RecipesTabProps) {
  const [filter, setFilter] = useState<RecipeCategory | "toutes">("toutes");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
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

  const save = (recipe: Recipe) => {
    update((current) => ({
      ...current,
      recipes: current.recipes.some((item) => item.id === recipe.id)
        ? current.recipes.map((item) => (item.id === recipe.id ? recipe : item))
        : [recipe, ...current.recipes],
    }));
    flash(editingId ? "Recette modifiée" : "Recette ajoutée");
    setCreating(false);
    setEditingId(null);
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

  if (creating || editing) {
    return (
      <div className="content page-content">
        <section className="page-heading recipe-heading">
          <p className="eyebrow">Mon carnet</p>
          <h2>{editing ? "Modifier la recette" : "Nouvelle recette"}</h2>
          {!editing && <p>Importez une capture d'écran (Instagram, site, livre…), collez le texte, ou écrivez-la vous-même.</p>}
        </section>
        <RecipeForm
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          onSave={save}
          onCancel={() => { setCreating(false); setEditingId(null); }}
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
        <h2>Mes recettes</h2>
        <p>Vos recettes à cuisiner : ingrédients, étapes, et ajout au journal en un geste.</p>
      </section>

      <button className="create-recipe" onClick={() => setCreating(true)}>
        <span><Icon name="plus" /></span>
        <div><strong>Ajouter une recette</strong><small>Depuis une capture d'écran, un texte ou à la main</small></div>
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
                  ? <button className="recipe-add" onClick={() => onAddToJournal(recipe)} aria-label={`Ajouter une portion de ${recipe.name} au journal`}><Icon name="plus" size={17} /></button>
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
          onAddToJournal={() => { setOpenId(null); onAddToJournal(opened); }}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import FoodPicker from "./FoodPicker";
import Icon from "./Icon";
import { carbsOf, fatOf, itemCalories, itemGrams, itemProtein, toMealItem, type FoodResult } from "../lib/foods";
import { estimateRecipeWeight } from "../lib/recipeWeight";
import { mealCategories, todayKey, type Meal, type MealCategory, type MealItem, type Recipe } from "../lib/storage";

type Mode = "parts" | "pieces" | "grams";

type RecipePortionPickerProps = {
  recipe: Recipe;
  category: MealCategory;
  /** Le repas, et ce qu'on retient pour la prochaine fois (nombre de morceaux, poids du plat). */
  onSave: (meal: Omit<Meal, "id">, remember: Pick<Recipe, "pieces" | "totalGrams">) => void;
};

const modes: { id: Mode; label: string; hint: string }[] = [
  { id: "parts", label: "Parts", hint: "4 burgers, j'en ai mangé 2" },
  { id: "pieces", label: "Morceaux", hint: "Gâteau coupé en 12, j'en ai mangé 2" },
  { id: "grams", label: "Grammes", hint: "Plat pesé, j'en ai mangé 250 g" },
];

const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const toNumber = (text: string) => Number(text.replace(",", ".")) || 0;

/**
 * « Ajouter à mes repas » depuis une recette : la quantité mangée en parts, en morceaux
 * ou en grammes, convertie en fraction du plat entier.
 */
export default function RecipePortionPicker({ recipe, category: initialCategory, onSave }: RecipePortionPickerProps) {
  const today = todayKey();
  const portions = recipe.portions || 1;
  const [mode, setMode] = useState<Mode>(recipe.pieces ? "pieces" : "parts");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState(initialCategory);
  /** Prévu : compté nulle part tant qu'il n'est pas confirmé « mangé » (jour à venir : toujours). */
  const [plannedChoice, setPlannedChoice] = useState(false);
  const planned = plannedChoice || date > today;
  const [parts, setParts] = useState(1);
  const [pieces, setPieces] = useState(String(recipe.pieces ?? 12));
  const [eatenPieces, setEatenPieces] = useState(1);
  const [totalGrams, setTotalGrams] = useState(recipe.totalGrams ? String(recipe.totalGrams) : "");
  const [eatenGrams, setEatenGrams] = useState("");
  const [weightNote, setWeightNote] = useState(recipe.totalGrams ? "Poids enregistré la dernière fois." : "");

  // Poids du plat entier : celui de la dernière fois, sinon estimé d'après les ingrédients.
  useEffect(() => {
    if (recipe.totalGrams) return;
    let alive = true;
    estimateRecipeWeight(recipe).then((grams) => {
      if (!alive || !grams) return;
      setTotalGrams((current) => current || String(grams));
      setWeightNote("Estimé d'après les ingrédients : pesez le plat pour plus de précision.");
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [recipe]);

  // --- Ingrédients changés pour ce repas (la recette du carnet ne change pas) ---------------
  const recipeFoods = recipe.ingredients.flatMap((group) => group.items).filter((item) => item.food).map((item) => ({ ...item.food! }));
  const handWritten = recipe.ingredients.flatMap((group) => group.items).filter((item) => !item.food).length;
  const [showIngredients, setShowIngredients] = useState(false);
  /** null : la recette telle quelle ; sinon les ingrédients de ce repas (plat entier). */
  const [changed, setChanged] = useState<MealItem[] | null>(null);
  const [replacing, setReplacing] = useState<number | "new" | null>(null);
  const ingredients = changed ?? recipeFoods;
  const setIngredient = (index: number, item: MealItem | null) => {
    const next = [...ingredients];
    if (item) next[index] = item; else next.splice(index, 1);
    setChanged(next);
  };
  /** Remplacer un ingrédient : le nouveau garde la même quantité (en grammes quand on la connaît). */
  const replaceWith = (index: number | "new", result: FoodResult) => {
    const fresh = toMealItem(result);
    if (index === "new") { setChanged([...ingredients, fresh]); setReplacing(null); return; }
    const grams = itemGrams(ingredients[index]);
    setIngredient(index, grams ? { ...fresh, unit: "g", quantity: Math.round(grams) } : fresh);
    setReplacing(null);
  };
  const unitText = (item: MealItem) => (item.unit === "g" ? (item.liquid ? "ml" : "g") : (item.portionLabel ?? "portion").replace(/^1\s+/, "").replace(/\s*\(.*$/, ""));

  // Part du plat entier mangée (1 = tout le plat).
  const fraction = mode === "parts"
    ? parts / portions
    : mode === "pieces"
      ? (toNumber(pieces) ? eatenPieces / toNumber(pieces) : 0)
      : (toNumber(totalGrams) ? toNumber(eatenGrams) / toNumber(totalGrams) : 0);
  const share = Math.max(0, fraction);
  // Plat entier : la recette, ou la somme des ingrédients changés pour ce repas.
  const whole = changed
    ? { kcal: changed.reduce((sum, item) => sum + itemCalories(item), 0), protein: changed.reduce((sum, item) => sum + itemProtein(item), 0), carbs: carbsOf(changed).carbs, fat: fatOf(changed).fat }
    : { kcal: recipe.calories * portions, protein: recipe.protein * portions, carbs: recipe.carbs === undefined ? null : recipe.carbs * portions, fat: recipe.fat === undefined ? null : recipe.fat * portions };
  const kcal = Math.round(whole.kcal * share);
  const carbs = whole.carbs === null ? null : Math.round(whole.carbs * share);
  const fat = whole.fat === null ? null : Math.round(whole.fat * share);
  const protein = Math.round(whole.protein * share);
  const valid = share > 0 && share <= 3;

  const describe = () => {
    if (mode === "parts") return `${n(parts)} part${parts > 1 ? "s" : ""} sur ${portions}`;
    if (mode === "pieces") return `${eatenPieces} morceau${eatenPieces > 1 ? "x" : ""} sur ${toNumber(pieces)}`;
    return `${n(toNumber(eatenGrams))} g sur ${n(toNumber(totalGrams))} g`;
  };

  const save = () => {
    if (!valid) return;
    // Ingrédients changés : le repas devient une assiette maison (le plat de ce jour-là, et ta part).
    if (changed) {
      onSave({
        date,
        ...(planned ? { status: "planned" as const } : {}),
        category,
        name: `${recipe.name} (adaptée, ${describe()})`,
        calories: kcal,
        protein: protein || undefined,
        ...(carbs !== null ? { carbs } : {}),
        ...(fat !== null ? { fat } : {}),
        source: "manual",
        drinksCounted: true,
        items: changed,
        plate: { servings: portions, share },
      }, { pieces: recipe.pieces, totalGrams: recipe.totalGrams });
      return;
    }
    onSave({
      date,
      ...(planned ? { status: "planned" as const } : {}),
      category,
      name: `${recipe.name} (${describe()})`,
      calories: kcal,
      protein: protein || undefined,
      ...(carbs !== null ? { carbs } : {}),
      ...(fat !== null ? { fat } : {}),
      source: "recipe",
      drinksCounted: true,
      // En parts de la recette : le repas se rouvre et se modifie comme les autres.
      items: [{
        name: recipe.name,
        source: "recette",
        ref: String(recipe.id),
        quantity: Math.round(share * portions * 100) / 100,
        unit: "portion",
        kcal100: recipe.calories,
        protein100: recipe.protein,
        carbs100: recipe.carbs ?? null,
        fat100: recipe.fat ?? null,
        portionLabel: "1 part",
        recipePortions: portions,
        ...(recipe.volumeMl ? { drinkMlPerPart: recipe.volumeMl / portions } : {}),
      }],
    }, {
      pieces: mode === "pieces" ? toNumber(pieces) || recipe.pieces : recipe.pieces,
      totalGrams: mode === "grams" ? toNumber(totalGrams) || recipe.totalGrams : recipe.totalGrams,
    });
  };

  const stepper = (value: number, set: (value: number) => void, step: number, min: number, label: string) => (
    <div className="stepper">
      <button type="button" onClick={() => set(Math.max(min, Math.round((value - step) * 100) / 100))} disabled={value <= min} aria-label={`${label} : moins`}><Icon name="minus" size={15} /></button>
      <strong>{n(value)}</strong>
      <button type="button" onClick={() => set(Math.round((value + step) * 100) / 100)} aria-label={`${label} : plus`}><Icon name="plus" size={15} /></button>
    </div>
  );

  return (
    <div className="portion-picker">
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
          <span>{date > today ? "Repas prévu (jour à venir) : il comptera une fois confirmé « mangé »" : "Prévu, pas encore mangé"}</span>
        </label>
      )}

      <div className="sex-selector portion-modes" role="radiogroup" aria-label="Comment compter">
        {modes.map((item) => (
          <button type="button" role="radio" key={item.id} aria-checked={mode === item.id} className={mode === item.id ? "selected" : ""} onClick={() => setMode(item.id)}>{item.label}</button>
        ))}
      </div>
      <small className="portion-hint">{modes.find((item) => item.id === mode)!.hint}</small>

      <section className="plate-share">
        {mode === "parts" && (
          <div className="share-row">
            <span>J'en ai mangé</span>
            {stepper(parts, setParts, 0.5, 0.5, "Parts")}
            <span>sur {portions}</span>
          </div>
        )}

        {mode === "pieces" && (
          <>
            <div className="share-row">
              <span>Plat coupé en</span>
              <input className="portion-input" value={pieces} onChange={(e) => setPieces(e.target.value)} inputMode="numeric" aria-label="Nombre de morceaux" />
              <span>morceaux</span>
            </div>
            <div className="share-row">
              <span>J'en ai mangé</span>
              {stepper(eatenPieces, setEatenPieces, 1, 1, "Morceaux")}
              <span>morceau{eatenPieces > 1 ? "x" : ""}</span>
            </div>
          </>
        )}

        {mode === "grams" && (
          <>
            <div className="share-row">
              <span>Plat entier</span>
              <input className="portion-input" value={totalGrams} onChange={(e) => { setTotalGrams(e.target.value); setWeightNote(""); }} inputMode="decimal" placeholder="—" aria-label="Poids du plat entier" />
              <span>g</span>
            </div>
            {weightNote && <small className="portion-hint">{weightNote}</small>}
            <div className="share-row">
              <span>J'en ai mangé</span>
              <input className="portion-input" value={eatenGrams} onChange={(e) => setEatenGrams(e.target.value)} inputMode="decimal" placeholder="—" aria-label="Grammes mangés" autoFocus />
              <span>g</span>
            </div>
          </>
        )}

        <div className="plate-mine">
          <span>
            Ma part
            <small>{valid ? `${Math.round(share * 100)} % du plat${carbs !== null ? ` · ${carbs} g de glucides` : ""}${protein ? ` · ${protein} g de protéines` : ""}${fat !== null ? ` · ${fat} g de lipides` : ""}${recipe.volumeMl ? ` · 💧 ${Math.round(recipe.volumeMl * share)} ml` : ""}` : "Indiquez la quantité mangée"}</small>
          </span>
          <strong>{valid ? kcal : "—"} kcal</strong>
        </div>
      </section>

      {!recipe.calories && <p className="food-hint">Calories de la recette pas encore calculées : modifiez la recette pour les ajouter.</p>}

      {recipeFoods.length > 0 && (
        <section className="adapt-ingredients">
          <button type="button" className="adapt-toggle" aria-expanded={showIngredients} onClick={() => setShowIngredients((value) => !value)}>
            <span><strong>Ingrédients{changed ? " · changés pour ce repas" : ""}</strong><small>{changed ? "La recette du carnet ne change pas." : "Pas de skyr aujourd'hui ? Moins de St Môret ? Change-les ici."}</small></span>
            <Icon name="chevron" size={16} />
          </button>
          {showIngredients && (
            <div className="adapt-list">
              <small className="portion-hint">Quantités pour le plat entier ({portions} pers.).</small>
              {ingredients.map((item, index) => (
                <div className="adapt-row" key={`${item.name}-${index}`}>
                  <div className="adapt-line">
                    <strong>{item.name}</strong>
                    <span className="adapt-kcal">{Math.round(itemCalories(item))} kcal</span>
                  </div>
                  <div className="adapt-line">
                    <span className="adapt-qty">
                      <input value={item.quantity} onChange={(e) => setIngredient(index, { ...item, quantity: Math.max(0, toNumber(e.target.value)) })} inputMode="decimal" aria-label={`Quantité de ${item.name}`} />
                      <span>{unitText(item)}</span>
                    </span>
                    <span className="adapt-actions">
                      <button type="button" className="text-button" onClick={() => setReplacing(replacing === index ? null : index)}>Remplacer</button>
                      <button type="button" className="icon-button" onClick={() => setIngredient(index, null)} aria-label={`Retirer ${item.name}`}><Icon name="close" size={14} /></button>
                    </span>
                  </div>
                  {replacing === index && (
                    <FoodPicker onPick={(result) => replaceWith(index, result)}>
                      <button type="button" className="text-button" onClick={() => setReplacing(null)}>Annuler</button>
                    </FoodPicker>
                  )}
                </div>
              ))}
              {replacing === "new" ? (
                <FoodPicker onPick={(result) => replaceWith("new", result)}>
                  <button type="button" className="text-button" onClick={() => setReplacing(null)}>Annuler</button>
                </FoodPicker>
              ) : (
                <button type="button" className="add-part" onClick={() => setReplacing("new")}><Icon name="plus" size={15} /> Ajouter un ingrédient</button>
              )}
              {handWritten > 0 && <small className="portion-hint">{handWritten} ingrédient{handWritten > 1 ? "s" : ""} écrit{handWritten > 1 ? "s" : ""} à la main (sel, poivre…) ne compte{handWritten > 1 ? "nt" : ""} pas.</small>}
              {changed && <button type="button" className="text-button" onClick={() => { setChanged(null); setReplacing(null); }}>Remettre les ingrédients de la recette</button>}
            </div>
          )}
        </section>
      )}
      <button type="button" className="submit-button" onClick={save} disabled={!valid}>
        <Icon name="check" /> {valid ? `${planned ? "Prévoir ce repas" : "Ajouter à mes repas"} · ${kcal} kcal` : "Ajouter à mes repas"}
      </button>
    </div>
  );
}

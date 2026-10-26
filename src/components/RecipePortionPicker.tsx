import { useEffect, useState } from "react";
import FoodPicker from "./FoodPicker";
import Icon from "./Icon";
import { carbsOf, fatOf, itemCalories, itemGrams, itemProtein, toMealItem, type FoodResult } from "../lib/foods";
import { matchIngredient } from "../lib/ingredientMatch";
import { formatIngredient } from "../lib/recipes";
import { estimateRecipeWeight } from "../lib/recipeWeight";
import { mealCategories, todayKey, type Meal, type MealCategory, type MealItem, type Recipe } from "../lib/storage";

type Mode = "parts" | "pieces" | "grams";
/** Un ingrédient de ce repas : l'aliment (ou rien, s'il n'a pas encore de valeurs) et la ligne écrite. */
type Row = { food: MealItem | null; text: string; guessed?: boolean };

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
  // Les ingrédients écrits à la main (« 2 tranches de cheddar ») sont aussi listés : l'app leur
  // cherche des valeurs, et on peut les choisir, les remplacer ou les retirer.
  const written = recipe.ingredients.flatMap((group) => group.items);
  const startRows = (): Row[] => written.map((item) => ({ food: item.food ? { ...item.food } : null, text: formatIngredient(item) }));
  const [showIngredients, setShowIngredients] = useState(false);
  const [rows, setRows] = useState<Row[]>(startRows);
  /** false : la recette telle quelle ; true : les ingrédients de ce repas (plat entier). */
  const [changed, setChanged] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matched, setMatched] = useState(false);
  const [replacing, setReplacing] = useState<number | "new" | null>(null);
  useEffect(() => {
    if (!showIngredients || matched) return;
    setMatched(true);
    const todo = written.filter((item) => !item.food);
    if (!todo.length) return;
    let alive = true;
    setMatching(true);
    Promise.all(todo.map((item) => matchIngredient(item).catch(() => null))).then((found) => {
      if (!alive) return;
      const byText = new Map(todo.map((item, index) => [formatIngredient(item), found[index]]));
      setRows((current) => current.map((row) => (row.food || !byText.get(row.text) ? row : { ...row, food: byText.get(row.text)!, guessed: true })));
      setMatching(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIngredients, matched]);
  const setRow = (index: number, row: Row | null) => {
    const next = [...rows];
    if (row) next[index] = row; else next.splice(index, 1);
    setRows(next);
    setChanged(true);
  };
  /** Remplacer un ingrédient : le nouveau garde la même quantité (en grammes quand on la connaît). */
  const replaceWith = (index: number | "new", result: FoodResult) => {
    const fresh = toMealItem(result);
    setReplacing(null);
    if (index === "new") { setRows([...rows, { food: fresh, text: fresh.name }]); setChanged(true); return; }
    const old = rows[index].food;
    const grams = old ? itemGrams(old) : null;
    setRow(index, { food: grams ? { ...fresh, unit: "g", quantity: Math.round(grams) } : fresh, text: rows[index].text });
  };
  const items = rows.flatMap((row) => (row.food ? [row.food] : []));
  const missing = rows.filter((row) => !row.food).length;
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
    ? { kcal: items.reduce((sum, item) => sum + itemCalories(item), 0), protein: items.reduce((sum, item) => sum + itemProtein(item), 0), carbs: carbsOf(items).carbs, fat: fatOf(items).fat }
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
        items,
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

      {written.length > 0 && (
        <section className="adapt-ingredients">
          <button type="button" className="adapt-toggle" aria-expanded={showIngredients} onClick={() => setShowIngredients((value) => !value)}>
            <span><strong>Ingrédients{changed ? " · changés pour ce repas" : ""}</strong><small>{changed ? "La recette du carnet ne change pas." : "Un autre fromage, du bacon en plus ? Change-les ici."}</small></span>
            <Icon name="chevron" size={16} />
          </button>
          {showIngredients && (
            <div className="adapt-list">
              <small className="portion-hint">Quantités pour le plat entier ({portions} pers.).</small>
              {matching && <small className="portion-hint">Recherche des valeurs des ingrédients écrits à la main…</small>}
              {rows.map((row, index) => (
                <div className="adapt-row" key={`${row.text}-${index}`}>
                  {row.food ? (<>
                    <div className="adapt-line">
                      <strong>{row.food.name}</strong>
                      <span className="adapt-kcal">{Math.round(itemCalories(row.food))} kcal</span>
                    </div>
                    {row.guessed && <small className="portion-hint">Valeurs trouvées pour « {row.text} »{row.food.matchedName ? ` : ${row.food.matchedName}` : ""}. Remplace-le si ce n'est pas le bon.</small>}
                    <div className="adapt-line">
                      <span className="adapt-qty">
                        <input value={row.food.quantity} onChange={(e) => setRow(index, { ...row, food: { ...row.food!, quantity: Math.max(0, toNumber(e.target.value)) } })} inputMode="decimal" aria-label={`Quantité de ${row.food.name}`} />
                        <span>{unitText(row.food)}</span>
                      </span>
                      <span className="adapt-actions">
                        <button type="button" className="text-button" onClick={() => setReplacing(replacing === index ? null : index)}>Remplacer</button>
                        <button type="button" className="icon-button" onClick={() => setRow(index, null)} aria-label={`Retirer ${row.food.name}`}><Icon name="close" size={14} /></button>
                      </span>
                    </div>
                  </>) : (<>
                    <div className="adapt-line">
                      <strong>{row.text}</strong>
                      <span className="adapt-kcal">sans valeurs</span>
                    </div>
                    <div className="adapt-line">
                      <button type="button" className="text-button" onClick={() => setReplacing(replacing === index ? null : index)}>Choisir l'aliment</button>
                      <button type="button" className="icon-button" onClick={() => setRow(index, null)} aria-label={`Retirer ${row.text}`}><Icon name="close" size={14} /></button>
                    </div>
                  </>)}
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
              {missing > 0 && <small className="portion-hint">{missing} ingrédient{missing > 1 ? "s" : ""} sans valeurs ne compte{missing > 1 ? "nt" : ""} pas (sel, poivre… ou à choisir).</small>}
              {changed && <small className="portion-hint">Plat entier recalculé d'après ces ingrédients : {Math.round(whole.kcal)} kcal (recette : {Math.round(recipe.calories * portions)} kcal).</small>}
              {changed && <button type="button" className="text-button" onClick={() => { setRows(startRows()); setMatched(false); setChanged(false); setReplacing(null); }}>Remettre les ingrédients de la recette</button>}
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

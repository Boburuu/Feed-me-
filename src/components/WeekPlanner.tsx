import { useState } from "react";
import Icon from "./Icon";
import { addDays, confirmEaten, copyDay, dayTotals, formatAmounts, isPlanned, planCopy, shoppingList, weekDays, weekStart } from "../lib/planning";
import { mealCategories, todayKey, type AppData, type Meal } from "../lib/storage";

type WeekPlannerProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  target: number;
  /** Prévoir un repas ce jour-là (fenêtre d'ajout, case « prévu » cochée). */
  onPlanMeal: (date: string) => void;
  onEditMeal: (meal: Meal) => void;
  flash: (message: string) => void;
};

const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
const n = (value: number) => value.toLocaleString("fr-FR");

/** Planning de la semaine (prévu / mangé) et liste de courses des repas prévus. */
export default function WeekPlanner({ data, update, target, onPlanMeal, onEditMeal, flash }: WeekPlannerProps) {
  const today = todayKey();
  const [start, setStart] = useState(() => weekStart(today));
  const [copying, setCopying] = useState<{ kind: "meal"; meal: Meal } | { kind: "day"; day: string } | null>(null);
  const [shopping, setShopping] = useState(false);
  const days = weekDays(start);

  /** Repas prévu un autre jour : on demande quand il a été mangé avant de le compter. */
  const [asking, setAsking] = useState<number | null>(null);
  const confirm = (meal: Meal, date = meal.date) => {
    if (!date || date > today) return;
    update((current) => ({ ...current, meals: confirmEaten(current.meals, meal.id, date) }));
    setAsking(null);
    flash(`Mangé ${date === today ? "aujourd'hui" : `le ${dayLabel(date)}`} · ${meal.calories} kcal`);
  };
  const remove = (meal: Meal) => {
    if (!window.confirm(`Supprimer « ${meal.name} » ?`)) return;
    update((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }));
  };
  const copyTo = (date: string) => {
    if (!copying || !date) return;
    const id = Date.now();
    const copies = copying.kind === "meal" ? [planCopy(copying.meal, date, id)] : copyDay(data.meals, copying.day, date, id);
    update((current) => ({ ...current, meals: [...current.meals, ...copies] }));
    flash(`${copies.length} repas prévu${copies.length > 1 ? "s" : ""} le ${dayLabel(date)}`);
    setCopying(null);
  };

  if (shopping) return <ShoppingList data={data} update={update} onClose={() => setShopping(false)} />;

  return (
    <section className="week-planner">
      <div className="week-head">
        <button type="button" className="icon-button" onClick={() => setStart(addDays(start, -7))} aria-label="Semaine précédente"><span className="flip"><Icon name="chevron" /></span></button>
        <strong>Semaine du {new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</strong>
        <button type="button" className="icon-button" onClick={() => setStart(addDays(start, 7))} aria-label="Semaine suivante"><Icon name="chevron" /></button>
      </div>
      <button type="button" className="add-line" onClick={() => setShopping(true)}><Icon name="check" size={15} /> Liste de courses des repas prévus</button>

      {copying && (
        <div className="copy-bar">
          <span>{copying.kind === "meal" ? `Copier « ${copying.meal.name} » vers :` : `Copier la journée du ${dayLabel(copying.day)} vers :`}</span>
          <input type="date" min={today} onChange={(e) => copyTo(e.target.value)} aria-label="Jour de destination" />
          <button type="button" className="text-button" onClick={() => setCopying(null)}>Annuler</button>
        </div>
      )}

      {days.map((day) => {
        const { plannedKcal, eatenKcal, meals } = dayTotals(data.meals, day);
        const sorted = mealCategories.flatMap((category) => meals.filter((meal) => meal.category === category.id));
        return (
          <article className={`plan-day${day === today ? " today" : ""}`} key={day}>
            <header>
              <strong>{day === today ? "Aujourd'hui" : dayLabel(day)}</strong>
              <small>
                {eatenKcal > 0 && <span>Mangé {n(eatenKcal)} kcal</span>}
                {plannedKcal > 0 && <span className="planned">Prévu {n(plannedKcal)} kcal</span>}
                {day >= today && plannedKcal + eatenKcal > 0 && <span>reste ≈ {n(target - eatenKcal - plannedKcal)} kcal</span>}
              </small>
            </header>
            {sorted.map((meal) => (
              <div className={`plan-meal${isPlanned(meal) ? " planned" : ""}`} key={meal.id}>
                <span className="plan-meal-text">
                  <small>{mealCategories.find((item) => item.id === meal.category)?.label} · {isPlanned(meal) ? "Prévu" : "Mangé"}</small>
                  <strong>{meal.name}</strong>
                </span>
                <em>{meal.calories} kcal</em>
                <div className="plan-meal-actions">
                  {isPlanned(meal) && <button type="button" className="plan-confirm" aria-expanded={asking === meal.id} onClick={() => (day === today ? confirm(meal) : setAsking(asking === meal.id ? null : meal.id))}><Icon name="check" size={14} /> Mangé</button>}
                  <button type="button" className="icon-button" onClick={() => onEditMeal(meal)} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={15} /></button>
                  <button type="button" className="icon-button" onClick={() => setCopying({ kind: "meal", meal })} aria-label={`Dupliquer ${meal.name}`}><Icon name="plus" size={15} /></button>
                  <button type="button" className="icon-button" onClick={() => remove(meal)} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={15} /></button>
                </div>
                {asking === meal.id && (
                  <div className="eaten-when" role="group" aria-label={`Mangé quand : ${meal.name}`}>
                    <strong>Mangé quand ?</strong>
                    <div className="eaten-when-choices">
                      <button type="button" className="plan-confirm" onClick={() => confirm(meal, today)}>Aujourd'hui</button>
                      {day < today && <button type="button" className="plan-confirm secondary" onClick={() => confirm(meal)}>Le jour prévu ({dayLabel(day)})</button>}
                    </div>
                    <label>Un autre jour<input type="date" max={today} onChange={(e) => confirm(meal, e.target.value)} /></label>
                  </div>
                )}
              </div>
            ))}
            <div className="plan-day-actions">
              {day >= today && <button type="button" className="text-button" onClick={() => onPlanMeal(day)}><Icon name="plus" size={14} /> Prévoir un repas</button>}
              {meals.length > 0 && <button type="button" className="text-button" onClick={() => setCopying({ kind: "day", day })}>Copier la journée</button>}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** Liste de courses : ingrédients regroupés des repas prévus, cases à cocher, lignes ajoutées. */
function ShoppingList({ data, update, onClose }: { data: AppData; update: WeekPlannerProps["update"]; onClose: () => void }) {
  const today = todayKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [extra, setExtra] = useState("");
  const lines = shoppingList(data.meals, data.recipes, from, to);
  const checked = new Set(data.shopping?.checked ?? []);
  const extras = data.shopping?.extras ?? [];
  const setShopping = (change: (shopping: NonNullable<AppData["shopping"]>) => NonNullable<AppData["shopping"]>) =>
    update((current) => ({ ...current, shopping: change(current.shopping ?? { checked: [], extras: [] }) }));
  const toggle = (key: string) => setShopping((shopping) => ({ ...shopping, checked: shopping.checked.includes(key) ? shopping.checked.filter((item) => item !== key) : [...shopping.checked, key] }));

  return (
    <section className="shopping-list">
      <div className="week-head">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Retour au planning"><span className="flip"><Icon name="chevron" /></span></button>
        <strong>Liste de courses</strong>
        <span />
      </div>
      <div className="meal-composer-when">
        <label>Du<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Au<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {lines.length === 0 && <p className="food-hint">Aucun repas prévu sur ces jours. Prévoyez des repas dans la semaine pour remplir la liste.</p>}
      {lines.map((line) => (
        <button type="button" className={`shop-line${checked.has(line.key) ? " done" : ""}`} key={line.key} onClick={() => toggle(line.key)} aria-pressed={checked.has(line.key)}>
          <span className="check-circle">{checked.has(line.key) && <Icon name="check" size={14} />}</span>
          <span className="shop-text">
            <strong>{line.name}</strong>
            <small>{line.from.join(" · ")}</small>
          </span>
          <em>{formatAmounts(line.amounts)}</em>
        </button>
      ))}
      {extras.map((item) => (
        <div className={`shop-line${item.done ? " done" : ""}`} key={item.id}>
          <button type="button" className="check-circle" onClick={() => setShopping((shopping) => ({ ...shopping, extras: shopping.extras.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)) }))} aria-label={`Cocher ${item.text}`}>
            {item.done && <Icon name="check" size={14} />}
          </button>
          <span className="shop-text"><strong>{item.text}</strong><small>Ajouté à la main</small></span>
          <button type="button" className="icon-button" onClick={() => setShopping((shopping) => ({ ...shopping, extras: shopping.extras.filter((entry) => entry.id !== item.id) }))} aria-label={`Retirer ${item.text}`}><Icon name="close" size={15} /></button>
        </div>
      ))}
      <form className="shop-add" onSubmit={(e) => { e.preventDefault(); if (!extra.trim()) return; setShopping((shopping) => ({ ...shopping, extras: [...shopping.extras, { id: Date.now(), text: extra.trim(), done: false }] })); setExtra(""); }}>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ajouter un article (éponges, pain…)" aria-label="Article à ajouter" />
        <button type="submit" className="add-button"><Icon name="plus" size={16} /></button>
      </form>
      {(checked.size > 0 || extras.some((item) => item.done)) && (
        <button type="button" className="text-button" onClick={() => setShopping((shopping) => ({ checked: [], extras: shopping.extras.filter((item) => !item.done) }))}>Vider les articles cochés</button>
      )}
    </section>
  );
}

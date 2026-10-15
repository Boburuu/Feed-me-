import { useState } from "react";
import Icon from "./Icon";
import WeekPlanner from "./WeekPlanner";
import WeightTracker from "./WeightTracker";
import { sessionLabel } from "../lib/activity";
import { mealCategories, todayKey, type AppData, type GoalType, type Meal } from "../lib/storage";
import { hydrationOf } from "../lib/hydration";
import { eatenMeals } from "../lib/planning";
import { formatWater, WATER_MAX } from "../lib/water";

type TrackingTabProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  target: number;
  goal: GoalType;
  waterGoal: number;
  onAddMeal: (date: string) => void;
  onSaveWeight: (date: string, kg: number) => void;
  onDeleteWeight: (id: number) => void;
  onEditMeal: (meal: Meal) => void;
  /** Envoyer un repas à quelqu'un (il ou elle choisit ses quantités). */
  onShareMeal: (meal: Meal) => void;
  onPlanMeal: (date: string) => void;
  flash: (message: string) => void;
};

type DayStatus = "none" | "partial" | "ok" | "over" | "under";

const statusLabels: Record<DayStatus, string> = {
  ok: "Dans l'objectif",
  over: "Au-dessus",
  under: "En dessous",
  partial: "Journal incomplet",
  none: "Rien de noté",
};

const keyOf = (date: Date) => todayKey(date);
const parse = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (key: string, days: number) => { const date = parse(key); date.setDate(date.getDate() + days); return keyOf(date); };
/** Correction d'un jour passé : par verre de 200 ml. */
const WATER_STEP = 200;
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const hours = (ms: number) => `${Math.floor(ms / 3_600_000)} h ${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0")}`;

export default function TrackingTab({ data, update, target, goal, waterGoal, onAddMeal, onSaveWeight, onDeleteWeight, onEditMeal, onShareMeal, onPlanMeal, flash }: TrackingTabProps) {
  const [view, setView] = useState<"calendar" | "week">("calendar");
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => today.slice(0, 7));

  const mealsByDay = new Map<string, Meal[]>();
  data.meals.forEach((meal) => mealsByDay.set(meal.date, [...(mealsByDay.get(meal.date) ?? []), meal]));
  // Seuls les repas mangés comptent ; les repas prévus sont affichés à part.
  const caloriesOf = (day: string) => eatenMeals(mealsByDay.get(day) ?? []).reduce((sum, meal) => sum + meal.calories, 0);

  const statusOf = (day: string): DayStatus => {
    const consumed = caloriesOf(day);
    if (!consumed) return "none";
    if (consumed < target * 0.5) return "partial";
    if (consumed > target + 100) return "over";
    if (goal === "prise" && consumed < target - 200) return "under";
    return "ok";
  };

  // --- Calendrier du mois -------------------------------------------------------
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(year, monthIndex - 1, 1, 12);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => keyOf(new Date(year, monthIndex - 1, i + 1, 12)))];
  const shiftMonth = (delta: number) => setMonth(keyOf(new Date(year, monthIndex - 1 + delta, 1, 12)).slice(0, 7));
  const weighedDays = new Set(data.weights.map((entry) => entry.date));
  const sportDays = new Set(data.sessions.map((session) => session.date));
  const fastDays = new Set(data.fasts.filter((fast) => fast.end && new Date(fast.end).getTime() - new Date(fast.start).getTime() >= 16 * 3_600_000).map((fast) => keyOf(new Date(fast.end!))));

  // --- Bilan de la semaine (lundi → dimanche) ----------------------------------------
  const monday = addDays(today, -((parse(today).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const logged7 = last7.filter((day) => caloriesOf(day) >= target * 0.5);
  const average = logged7.length ? Math.round(logged7.reduce((sum, day) => sum + caloriesOf(day), 0) / logged7.length) : null;
  let streak = 0;
  for (let day = caloriesOf(today) ? today : addDays(today, -1); caloriesOf(day) > 0; day = addDays(day, -1)) streak += 1;
  const sortedWeights = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const monthAgo = addDays(today, -30);
  const weightStart = sortedWeights.find((entry) => entry.date >= monthAgo);
  const weightEnd = sortedWeights.at(-1);
  const weightChange = weightStart && weightEnd && weightStart !== weightEnd ? weightEnd.kg - weightStart.kg : null;

  // --- Jour sélectionné -----------------------------------------------------------
  const dayMeals = mealsByDay.get(selected) ?? [];
  const dayCalories = caloriesOf(selected);
  const dayEaten = eatenMeals(dayMeals);
  const dayProtein = dayEaten.reduce((sum, meal) => sum + (meal.protein ?? 0), 0);
  const dayCarbs = dayEaten.reduce((sum, meal) => sum + (meal.carbs ?? 0), 0);
  const dayFat = dayEaten.reduce((sum, meal) => sum + (meal.fat ?? 0), 0);
  const dayWater = data.water[selected] ?? 0;
  const dayHydration = hydrationOf(data, selected);
  const dayWeight = data.weights.find((entry) => entry.date === selected);
  const dayFasts = data.fasts.filter((fast) => fast.end && keyOf(new Date(fast.end)) === selected);
  const daySessions = data.sessions.filter((session) => session.date === selected);
  const status = statusOf(selected);

  const setWater = (value: number) =>
    update((current) => ({ ...current, water: { ...current.water, [selected]: Math.max(0, Math.min(value, WATER_MAX)) } }));
  const deleteMeal = (meal: Meal) => {
    if (window.confirm(`Supprimer « ${meal.name} » (${meal.calories} kcal) ?`)) {
      update((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }));
    }
  };

  const monthLabel = first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="content page-content">
      <section className="page-heading">
        <span className="large-icon mint-icon"><Icon name="calendar" size={25} /></span>
        <p className="eyebrow">Mon suivi</p>
        <h2>Jour après jour</h2>
        <p>Retrouvez chaque journée : repas, eau, poids, sport et jeûne. Touchez un jour du calendrier pour le détail.</p>
      </section>

      <div className="sex-selector tracking-view" role="radiogroup" aria-label="Affichage">
        <button type="button" role="radio" aria-checked={view === "calendar"} className={view === "calendar" ? "selected" : ""} onClick={() => setView("calendar")}>Calendrier</button>
        <button type="button" role="radio" aria-checked={view === "week"} className={view === "week" ? "selected" : ""} onClick={() => setView("week")}>Semaine et courses</button>
      </div>
      {view === "week" ? (
        <WeekPlanner data={data} update={update} target={target} onPlanMeal={onPlanMeal} onEditMeal={onEditMeal} flash={flash} />
      ) : (<>

      <section className="weekly-card">
        <div>
          <span>Moyenne sur 7 jours</span>
          <strong>{average ? `${average.toLocaleString("fr-FR")} kcal` : "—"}</strong>
          <small>{logged7.length}/7 jours notés · objectif {target.toLocaleString("fr-FR")}</small>
        </div>
        <div className="week-bars">
          {week.map((day, index) => {
            const ratio = Math.min(caloriesOf(day) / target, 1.3);
            return (
              <button type="button" key={day} onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }} aria-label={`${parse(day).toLocaleDateString("fr-FR", { weekday: "long" })} : ${caloriesOf(day)} kcal`}>
                <i style={{ height: `${Math.max(4, (ratio / 1.3) * 100)}%` }} className={`${day === today ? "today" : ""} bar-${statusOf(day)}`} />
                <small>{["L", "M", "M", "J", "V", "S", "D"][index]}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tracking-stats">
        <span><Icon name="flame" /><strong>{streak} j</strong><small>d'affilée avec repas notés</small></span>
        <span><Icon name="scale" /><strong>{weightChange === null ? "—" : `${weightChange > 0 ? "+" : weightChange < 0 ? "−" : ""}${n(Math.abs(weightChange))} kg`}</strong><small>sur 30 jours</small></span>
        <span><Icon name="water" /><strong>{formatWater(last7.reduce((sum, day) => sum + hydrationOf(data, day).totalMl, 0) / 7)}</strong><small>bus / jour</small></span>
      </section>

      <section className="calendar-card">
        <div className="calendar-head">
          <button type="button" className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Mois précédent"><span className="flip"><Icon name="chevron" /></span></button>
          <strong>{monthLabel}</strong>
          <button type="button" className="icon-button" onClick={() => shiftMonth(1)} disabled={month >= today.slice(0, 7)} aria-label="Mois suivant"><Icon name="chevron" /></button>
        </div>
        <div className="calendar-grid">
          {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span key={index} className="calendar-weekday">{day}</span>)}
          {cells.map((day, index) => day ? (
            <button
              type="button"
              key={day}
              className={`calendar-day day-${statusOf(day)} ${day === selected ? "selected" : ""} ${day === today ? "today" : ""}`}
              onClick={() => setSelected(day)}
              disabled={day > today}
              aria-label={`${parse(day).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${statusLabels[statusOf(day)]}`}
              aria-pressed={day === selected}
            >
              {Number(day.slice(8))}
              <span className="calendar-marks">
                {weighedDays.has(day) && <i className="mark-weight" />}
                {fastDays.has(day) && <i className="mark-fast" />}
                {sportDays.has(day) && <i className="mark-sport" />}
              </span>
            </button>
          ) : <span key={`empty-${index}`} />)}
        </div>
        <div className="calendar-legend">
          <span><i className="day-ok" />Objectif</span>
          <span><i className="day-over" />Au-dessus</span>
          {goal === "prise" && <span><i className="day-under" />En dessous</span>}
          <span><i className="day-partial" />Incomplet</span>
          <span><i className="mark-weight" />Pesée</span>
          {data.fasts.length > 0 && <span><i className="mark-fast" />Jeûne réussi</span>}
          {data.sessions.length > 0 && <span><i className="mark-sport" />Sport</span>}
        </div>
      </section>

      <section className="day-card">
        <div className="section-title">
          <div>
            <p className="eyebrow">{selected === today ? "Aujourd'hui" : statusLabels[status]}</p>
            <h2>{parse(selected).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2>
          </div>
        </div>

        <div className="day-calories">
          <div><strong>{dayCalories.toLocaleString("fr-FR")}</strong><small> / {target.toLocaleString("fr-FR")} kcal</small></div>
          <span className={`goal-bar status-${status}`}><span style={{ width: `${Math.min(100, (dayCalories / target) * 100)}%` }} /></span>
          {dayProtein > 0 && <small>{dayProtein} g de protéines</small>}
          {dayCarbs > 0 && <small>{dayCarbs} g de glucides</small>}
          {dayFat > 0 && <small>{dayFat} g de lipides</small>}
        </div>

        <div className="day-facts">
          <span className="day-water">
            <Icon name="water" size={18} />
            <span>{formatWater(dayHydration.totalMl)} / {formatWater(waterGoal)}{dayHydration.mealsMl > 0 ? ` (eau ${formatWater(dayHydration.pureWaterMl)})` : ""}</span>
            <button type="button" onClick={() => setWater(dayWater - WATER_STEP)} disabled={!dayWater} aria-label={`Retirer ${WATER_STEP} ml`}><Icon name="minus" size={14} /></button>
            <button type="button" onClick={() => setWater(dayWater + WATER_STEP)} aria-label={`Ajouter ${WATER_STEP} ml`}><Icon name="plus" size={14} /></button>
          </span>
          <span><Icon name="scale" size={18} /> {dayWeight ? `${n(dayWeight.kg)} kg` : "Pas de pesée"}</span>
          {data.steps[selected] && (
            <span><Icon name="shoe" size={18} /> {data.steps[selected].count.toLocaleString("fr-FR")} pas</span>
          )}
          {daySessions.map((session) => (
            <span key={session.id}><Icon name="shoe" size={18} /> {sessionLabel(session.type)} · {session.minutes} min</span>
          ))}
          {dayFasts.map((fast) => (
            <span key={fast.id}><Icon name="clock" size={18} /> Jeûne de {hours(new Date(fast.end!).getTime() - new Date(fast.start).getTime())}</span>
          ))}
        </div>

        <div className="meal-list">
          {dayMeals.length === 0 && <p className="day-empty">Aucun repas noté ce jour-là.</p>}
          {mealCategories.flatMap((category) => dayMeals.filter((meal) => meal.category === category.id)).map((meal) => (
            <div className="meal-row editable" key={meal.id} onClick={() => onEditMeal(meal)}>
              <span className="meal-icon breakfast"><Icon name={meal.source === "photo" ? "camera" : meal.source === "recipe" ? "book" : "apple"} /></span>
              <span><strong>{mealCategories.find((item) => item.id === meal.category)?.label}</strong><small>{meal.name}</small>{meal.carbs !== undefined && <small className="meal-carbs">{meal.carbs} g de glucides</small>}</span>
              <span className="meal-calories"><strong>{meal.calories}</strong><small>kcal</small></span>
              {meal.items?.length
                ? <button className="icon-button" onClick={(event) => { event.stopPropagation(); onShareMeal(meal); }} aria-label={`Partager ${meal.name}`}><Icon name="share" size={16} /></button>
                : <button className="icon-button" onClick={(event) => { event.stopPropagation(); onEditMeal(meal); }} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={16} /></button>}
              <button className="icon-button" onClick={(event) => { event.stopPropagation(); deleteMeal(meal); }} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
        <button className="ghost-button day-add" onClick={() => onAddMeal(selected)}><Icon name="plus" size={17} /> Ajouter un repas {selected === today ? "aujourd'hui" : "à ce jour"}</button>
      </section>

      <WeightTracker weights={data.weights} onAdd={onSaveWeight} onDelete={onDeleteWeight} />
      </>)}
    </div>
  );
}

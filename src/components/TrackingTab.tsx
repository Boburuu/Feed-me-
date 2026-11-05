import type { SharePayload } from "../lib/share";
import { joinNames } from "../lib/tablee";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import WeekPlanner from "./WeekPlanner";
import WeightTracker from "./WeightTracker";
import WeeklyReportCard, { ReportSummary } from "./WeeklyReportCard";
import StoredImage from "./StoredImage";
import { sessionLabel, sessionTypes } from "../lib/activity";
import { HOME_MEAL_ORDER, mealGlyph, mealImageId } from "../lib/mealVisual";
import { mealCategories, todayKey, type AppData, type GoalType, type Meal, type MealCategory, type SessionType } from "../lib/storage";
import { hydrationOf } from "../lib/hydration";
import { eatenMeals, isPlanned } from "../lib/planning";
import { freeLabel, isFreeDay } from "../lib/freeDays";
import { formatWater, WATER_MAX } from "../lib/water";

/** Onglets du suivi : la journée, la semaine (planning et courses), le bilan, le poids. */
export type TrackingView = "jour" | "semaine" | "bilan" | "poids";
const views: [TrackingView, string][] = [["jour", "Jour"], ["semaine", "Semaine"], ["bilan", "Bilan"], ["poids", "Poids"]];

type TrackingTabProps = {
  view: TrackingView;
  onView: (view: TrackingView) => void;
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  target: number;
  goal: GoalType;
  waterGoal: number;
  /** Protéines visées par jour (plan), pour le bilan de la semaine. */
  proteinGoal: number;
  onAddMeal: (date: string, planned?: boolean, category?: MealCategory | null) => void;
  /** Noter un cheat day ce jour-là (sans détailler les aliments). */
  onCheatDay: (date: string) => void;
  onSaveWeight: (date: string, kg: number) => void;
  onDeleteWeight: (id: number) => void;
  onEditMeal: (meal: Meal) => void;
  /** Envoyer un repas à quelqu'un (il ou elle choisit ses quantités). */
  onShareMeal: (meal: Meal) => void;
  /** Partager les repas prévus ou la liste de courses. */
  onShare: (payload: SharePayload) => void;
  onPlanMeal: (date: string) => void;
  flash: (message: string) => void;
};

const WEEK_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const sessionIcon = (type: SessionType) => sessionTypes.find((item) => item.id === type)?.icon ?? "shoe";

type DayStatus = "none" | "partial" | "ok" | "over" | "under" | "free";

const statusLabels: Record<DayStatus, string> = {
  ok: "Dans l'objectif",
  over: "Au-dessus",
  under: "En dessous",
  partial: "Journal incomplet",
  none: "Rien de noté",
  free: "Cheat day",
};

const keyOf = (date: Date) => todayKey(date);
const parse = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (key: string, days: number) => { const date = parse(key); date.setDate(date.getDate() + days); return keyOf(date); };
/** Correction d'un jour passé : par verre de 200 ml. */
const WATER_STEP = 200;
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const hours = (ms: number) => `${Math.floor(ms / 3_600_000)} h ${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0")}`;

export default function TrackingTab({ view, onView: setView, data, update, target, goal, waterGoal, proteinGoal, onAddMeal, onCheatDay, onSaveWeight, onDeleteWeight, onEditMeal, onShareMeal, onShare, onPlanMeal, flash }: TrackingTabProps) {
  const reportTargets = useMemo(() => ({ kcal: target, protein: proteinGoal, waterMl: waterGoal, stepGoal: data.stepGoal, goal }), [target, proteinGoal, waterGoal, data.stepGoal, goal]);
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  /** Replié, le calendrier ne montre que la semaine du jour choisi. */
  const [calendarOpen, setCalendarOpen] = useState(false);

  const mealsByDay = new Map<string, Meal[]>();
  data.meals.forEach((meal) => mealsByDay.set(meal.date, [...(mealsByDay.get(meal.date) ?? []), meal]));
  // Seuls les repas mangés comptent ; les repas prévus sont affichés à part.
  const caloriesOf = (day: string) => eatenMeals(mealsByDay.get(day) ?? []).reduce((sum, meal) => sum + meal.calories, 0);

  const statusOf = (day: string): DayStatus => {
    // Repas libre ce jour-là : calories inconnues, le jour n'est ni « au-dessus » ni « incomplet ».
    if (isFreeDay(data.meals, day)) return "free";
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
  const selectedMonday = addDays(selected, -((parse(selected).getDay() + 6) % 7));
  const weekOfSelected = Array.from({ length: 7 }, (_, i) => addDays(selectedMonday, i));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const logged7 = last7.filter((day) => !isFreeDay(data.meals, day) && caloriesOf(day) >= target * 0.5);
  const average = logged7.length ? Math.round(logged7.reduce((sum, day) => sum + caloriesOf(day), 0) / logged7.length) : null;
  let streak = 0;
  // Un jour libre compte dans la série : il a bien été noté.
  const notedDay = (day: string) => caloriesOf(day) > 0 || isFreeDay(data.meals, day);
  for (let day = notedDay(today) ? today : addDays(today, -1); notedDay(day); day = addDays(day, -1)) streak += 1;
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
      <div className="sex-selector tracking-view tracking-tabs" role="tablist" aria-label="Mon suivi">
        {views.map(([id, label]) => (
          <button type="button" role="tab" aria-selected={view === id} key={id} className={view === id ? "selected" : ""} onClick={() => { setView(id); window.scrollTo(0, 0); }}>{label}</button>
        ))}
      </div>

      {/* Le point principal du bilan, en haut de chaque onglet. */}
      {view !== "bilan" && <ReportSummary data={data} targets={reportTargets} today={today} onOpen={() => { setView("bilan"); window.scrollTo(0, 0); }} />}

      {view === "semaine" && <WeekPlanner data={data} update={update} target={target} onPlanMeal={onPlanMeal} onEditMeal={onEditMeal} onShare={onShare} flash={flash} />}
      {view === "bilan" && <WeeklyReportCard data={data} targets={reportTargets} today={today} />}
      {view === "poids" && <WeightTracker weights={data.weights} maintenance={goal === "maintien"} onAdd={onSaveWeight} onDelete={onDeleteWeight} />}
      {view === "jour" && (<>

      <section className="sv-card">
        <div className="sv-top">
          <div className="sv-avg">
            <small>Moyenne sur 7 jours</small>
            <strong>{average ? `${average.toLocaleString("fr-FR")} kcal` : "—"}</strong>
            <small>{logged7.length}/7 jours notés · objectif {target.toLocaleString("fr-FR")}</small>
          </div>
          <div className="sv-bars">
            {week.map((day, index) => {
              const ratio = Math.min(caloriesOf(day) / target, 1.3);
              return (
                <button type="button" key={day} className={day === selected ? "on" : ""} onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }} disabled={day > today} aria-label={`${parse(day).toLocaleDateString("fr-FR", { weekday: "long" })} : ${statusLabels[statusOf(day)]}`}>
                  <i style={{ height: `${Math.max(6, (ratio / 1.3) * 100)}%` }} className={`st-${statusOf(day)}`} />
                  <small>{WEEK_LETTERS[index]}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="sv-stats">
          <span><b>{streak} j</b><small>d'affilée avec repas notés</small></span>
          <span><b>{weightChange === null ? "—" : `${weightChange > 0 ? "+" : weightChange < 0 ? "−" : ""}${n(Math.abs(weightChange))} kg`}</b><small>sur 30 jours</small></span>
          <span><b>{formatWater(last7.reduce((sum, day) => sum + hydrationOf(data, day).totalMl, 0) / 7)}</b><small>bus / jour</small></span>
        </div>
      </section>

      <section className="sv-card sv-cal">
        {calendarOpen ? (
          <div className="sv-cal-h">
            <button type="button" className="round-button soft" onClick={() => shiftMonth(-1)} aria-label="Mois précédent"><Icon name="back" size={18} /></button>
            <b className="sv-month">{monthLabel}</b>
            <button type="button" className="round-button soft" onClick={() => shiftMonth(1)} disabled={month >= today.slice(0, 7)} aria-label="Mois suivant"><Icon name="chevron" size={18} /></button>
          </div>
        ) : (
          <div className="sv-cal-h">
            <b>{parse(selected).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</b>
            <button type="button" className="sv-link" aria-expanded="false" onClick={() => { setMonth(selected.slice(0, 7)); setCalendarOpen(true); }}><Icon name="calendar" size={16} /> Voir le mois</button>
          </div>
        )}
        <div className="sv-g sv-h">{WEEK_LETTERS.map((day, index) => <small key={index}>{day}</small>)}</div>
        <div className="sv-g">
          {(calendarOpen ? cells : weekOfSelected).map((day, index) => day ? (
            <button
              type="button"
              key={day}
              className={`sv-d st-${statusOf(day)}${day === selected ? " on" : ""}${day === today ? " now" : ""}`}
              onClick={() => setSelected(day)}
              disabled={day > today}
              aria-label={`${parse(day).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${statusLabels[statusOf(day)]}`}
              aria-pressed={day === selected}
            >
              <b>{Number(day.slice(8))}</b>
              <span>
                {weighedDays.has(day) && <i className="m-w" />}
                {fastDays.has(day) && <i className="m-f" />}
                {sportDays.has(day) && <i className="m-s" />}
              </span>
            </button>
          ) : <span key={`empty-${index}`} />)}
        </div>
        {calendarOpen && (
          <>
            <div className="sv-leg">
              <span><i className="st-ok" />Objectif</span>
              <span><i className="st-over" />Au-dessus</span>
              {goal === "prise" && <span><i className="st-under" />En dessous</span>}
              <span><i className="st-partial" />Incomplet</span>
              {data.meals.some((meal) => meal.free) && <span><i className="st-free" />Cheat day</span>}
              <span><i className="m-w" />Pesée</span>
              {data.fasts.length > 0 && <span><i className="m-f" />Jeûne réussi</span>}
              {data.sessions.length > 0 && <span><i className="m-s" />Sport</span>}
            </div>
            <button type="button" className="sv-link" aria-expanded="true" onClick={() => setCalendarOpen(false)}>Réduire à la semaine</button>
          </>
        )}
      </section>

      <section className="sv-card sv-day">
        <div className="sv-day-h">
          <div>
            <small>{selected === today ? "Aujourd'hui" : statusLabels[status]}</small>
            <h2>{parse(selected).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2>
          </div>
          <strong>{dayCalories.toLocaleString("fr-FR")}<small> / {target.toLocaleString("fr-FR")} kcal</small></strong>
        </div>
        <span className="gg"><i style={{ width: `${Math.min(100, (dayCalories / target) * 100)}%` }} /></span>
        <div className="sv-mac">
          <span><b>{dayProtein} g</b><small>protéines</small></span>
          <span><b>{dayCarbs} g</b><small>glucides</small></span>
          <span><b>{dayFat} g</b><small>lipides</small></span>
        </div>
        <div className="sv-facts">
          <span className="sv-f sv-water">
            <Icon name="water" size={16} />
            <span>{formatWater(dayHydration.totalMl)} / {formatWater(waterGoal)}{dayHydration.mealsMl > 0 ? ` (eau ${formatWater(dayHydration.pureWaterMl)})` : ""}</span>
            <button type="button" className="sv-mini" onClick={() => setWater(dayWater - WATER_STEP)} disabled={!dayWater} aria-label={`Retirer ${WATER_STEP} ml`}><Icon name="minus" size={14} /></button>
            <button type="button" className="sv-mini" onClick={() => setWater(dayWater + WATER_STEP)} aria-label={`Ajouter ${WATER_STEP} ml`}><Icon name="plus" size={14} /></button>
          </span>
          <span className="sv-f"><Icon name="scale" size={16} /> {dayWeight ? `${n(dayWeight.kg)} kg` : "Pas de pesée"}</span>
          {data.steps[selected] && <span className="sv-f"><Icon name="shoe" size={16} /> {data.steps[selected].count.toLocaleString("fr-FR")} pas</span>}
          {daySessions.map((session) => <span className="sv-f" key={session.id}><Icon name={sessionIcon(session.type)} size={16} /> {sessionLabel(session.type)} · {session.minutes} min</span>)}
          {dayFasts.map((fast) => <span className="sv-f" key={fast.id}><Icon name="hourglass" size={16} /> Jeûne de {hours(new Date(fast.end!).getTime() - new Date(fast.start).getTime())}</span>)}
        </div>
      </section>

      <div className="m-list">
        {HOME_MEAL_ORDER.map((category) => {
          const label = mealCategories.find((item) => item.id === category)?.label;
          const meals = dayMeals.filter((meal) => meal.category === category);
          const glyph = <span className={`meal-icon glyph-${category}`}><Icon name={mealGlyph[category]} /></span>;
          if (!meals.length) {
            return (
              <button className="mr" key={category} onClick={() => onAddMeal(selected, false, category)}>
                {glyph}
                <span className="m-t"><b>{label}</b><small>Rien de noté</small></span>
                <span className="mr-plus"><Icon name="plus" size={18} /></span>
              </button>
            );
          }
          return meals.map((meal) => {
            const image = mealImageId(meal, data.recipes);
            return (
              <div className="mr mr-meal" key={meal.id} onClick={() => onEditMeal(meal)}>
                <span className="mr-top">
                  {image ? <span className="thumb"><StoredImage id={image} alt="" /></span> : glyph}
                  <span className="m-t">
                    <b>{label}</b>
                    <small>{meal.name}</small>
                    {meal.with?.length ? <small className="meal-with-line">avec {joinNames(meal.with)}</small> : null}
                    {meal.acks ? <small className="meal-with-line">{Object.entries(meal.acks).map(([name, part]) => `✓ ${name} : ${part}`).join(" · ")}</small> : null}
                    {isPlanned(meal) && <small className="meal-with-line">Prévu, pas encore compté</small>}
                    {meal.carbs !== undefined && <small className="meal-carbs">{meal.carbs} g de glucides</small>}
                  </span>
                  <span className="meal-calories">{meal.free ? <><strong>{freeLabel(meal)}</strong><small>{meal.freeEstimate ? "kcal" : "day"}</small></> : <><strong>{meal.calories}</strong><small>kcal</small></>}</span>
                </span>
                <span className="mr-acts">
                  <button className="icon-button" onClick={(event) => { event.stopPropagation(); onEditMeal(meal); }} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={16} /></button>
                  {meal.items?.length ? <button className="icon-button" onClick={(event) => { event.stopPropagation(); onShareMeal(meal); }} aria-label={`Partager ${meal.name}`}><Icon name="share" size={16} /></button> : null}
                  <button className="icon-button" onClick={(event) => { event.stopPropagation(); deleteMeal(meal); }} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={16} /></button>
                </span>
              </div>
            );
          });
        })}
      </div>
      <div className="sv-actions">
        <button className="ghost-button" onClick={() => onAddMeal(selected)}><Icon name="plus" size={17} /> Ajouter un repas</button>
        {selected <= today && <button className="ghost-button" onClick={() => onCheatDay(selected)}><Icon name="confetti" size={17} /> Cheat day</button>}
      </div>

      </>)}
    </div>
  );
}

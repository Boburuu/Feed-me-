import type { Meal } from "../lib/storage";

type EatenWhenProps = {
  meal: Meal;
  today: string;
  /** Jour où le repas a vraiment été mangé (aujourd'hui ou avant). */
  onConfirm: (date: string) => void;
};

export const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });

/** « Mangé quand ? » : aujourd'hui, le jour prévu (s'il est passé) ou n'importe quel jour avant. */
export default function EatenWhen({ meal, today, onConfirm }: EatenWhenProps) {
  return (
    <div className="eaten-when" role="group" aria-label={`Mangé quand : ${meal.name}`}>
      <strong>Mangé quand ?</strong>
      <div className="eaten-when-choices">
        <button type="button" className="plan-confirm" onClick={() => onConfirm(today)}>Aujourd'hui</button>
        {meal.date < today && <button type="button" className="plan-confirm secondary" onClick={() => onConfirm(meal.date)}>Le jour prévu ({dayLabel(meal.date)})</button>}
      </div>
      <label>Un autre jour<input type="date" max={today} onChange={(e) => e.target.value && e.target.value <= today && onConfirm(e.target.value)} /></label>
    </div>
  );
}

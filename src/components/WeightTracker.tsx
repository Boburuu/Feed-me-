import { useState } from "react";
import Icon from "./Icon";
import { limits, todayKey, type WeightEntry } from "../lib/storage";

type WeightTrackerProps = {
  weights: WeightEntry[];
  onAdd: (date: string, kg: number) => void;
  onDelete: (id: number) => void;
};

const W = 320;
const H = 150;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const kgLabel = (kg: number) => `${kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;

export default function WeightTracker({ weights, onAdd, onDelete }: WeightTrackerProps) {
  const [date, setDate] = useState(todayKey());
  const [kg, setKg] = useState("");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const points = sorted.slice(-30);
  const latest = sorted.at(-1);
  const first = sorted[0];
  const delta = latest && first ? latest.kg - first.kg : 0;

  // Échelle Y : 1 kg de marge, graduations entières.
  const values = points.map((point) => point.kg);
  const yMin = Math.floor(Math.min(...values, Infinity) - 1);
  const yMax = Math.ceil(Math.max(...values, -Infinity) + 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length > 1 ? (index / (points.length - 1)) * innerW : innerW / 2);
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin || 1)) * innerH;
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.kg).toFixed(1)}`).join(" ");

  const track = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * W;
    let nearest = 0;
    points.forEach((_, index) => {
      if (Math.abs(x(index) - svgX) < Math.abs(x(nearest) - svgX)) nearest = index;
    });
    setHover(nearest);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(kg.replace(",", "."));
    const { min, max } = limits.weight;
    if (!Number.isFinite(value) || value < min || value > max) {
      setError(`Le poids doit être compris entre ${min} et ${max} kg.`);
      return;
    }
    if (date > todayKey()) {
      setError("La date ne peut pas être dans le futur.");
      return;
    }
    setError("");
    onAdd(date, Math.round(value * 10) / 10);
    setKg("");
    setDate(todayKey());
  };

  const remove = (entry: WeightEntry) => {
    if (window.confirm(`Supprimer la pesée du ${shortDate(entry.date)} (${kgLabel(entry.kg)}) ?`)) onDelete(entry.id);
  };

  const active = hover !== null ? points[hover] : null;
  const history = [...sorted].reverse();

  return (
    <section className="weight-card" id="suivi-poids">
      <div className="section-title">
        <div><p className="eyebrow">Suivi</p><h2>Mon poids</h2></div>
        {sorted.length > 1 && (
          <span className="current-theme">{delta > 0 ? "+" : delta < 0 ? "−" : "±"}{kgLabel(Math.abs(delta))} depuis le {shortDate(first.date)}</span>
        )}
      </div>

      <div className="weight-summary">
        <span className="metric-icon"><Icon name="scale" /></span>
        <div>
          <p>Dernière pesée</p>
          <strong>{latest ? kgLabel(latest.kg) : "—"}</strong>
          <small>{latest ? `le ${shortDate(latest.date)}` : "Ajoutez votre première pesée"}</small>
        </div>
      </div>

      {points.length > 0 && (
        <figure className="weight-chart">
          <figcaption className="sr-only">Évolution du poids sur les {points.length} dernières pesées</figcaption>
          <div className="chart-tooltip" aria-live="polite">
            {active ? <><strong>{kgLabel(active.kg)}</strong> · {shortDate(active.date)}</> : "Touchez le graphique pour voir une valeur"}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Poids de ${kgLabel(points[0].kg)} le ${shortDate(points[0].date)} à ${kgLabel(points.at(-1)!.kg)} le ${shortDate(points.at(-1)!.date)}`}
            onPointerMove={track}
            onPointerDown={track}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((tick) => (
              <g key={tick} className="chart-grid">
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
                <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end">{tick}</text>
              </g>
            ))}
            <text className="chart-axis" x={PAD.left} y={H - 6}>{shortDate(points[0].date)}</text>
            {points.length > 1 && <text className="chart-axis" x={W - PAD.right} y={H - 6} textAnchor="end">{shortDate(points.at(-1)!.date)}</text>}
            {active && <line className="chart-crosshair" x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={H - PAD.bottom} />}
            {points.length > 1 && <path className="chart-line" d={line} />}
            {points.map((point, index) => (
              <circle
                key={point.id}
                className={`chart-dot ${index === hover ? "active" : ""}`}
                cx={x(index)}
                cy={y(point.kg)}
                r={index === hover || index === points.length - 1 ? 5 : 3.5}
              />
            ))}
          </svg>
        </figure>
      )}

      <form className="weight-form" onSubmit={submit} noValidate>
        <label><span>Date</span><input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} required /></label>
        <label><span>Poids</span><div><input type="number" inputMode="decimal" step="0.1" placeholder="62,5" value={kg} onChange={(e) => setKg(e.target.value)} required /><small>kg</small></div></label>
        <button className="round-button weight-add" type="submit" aria-label="Enregistrer la pesée"><Icon name="plus" size={18} /></button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="weight-note">Une seule pesée par jour : une nouvelle valeur à la même date remplace la précédente.</p>

      {history.length > 0 && (
        <ul className="weight-history">
          {(showAll ? history : history.slice(0, 5)).map((entry, index) => {
            const previous = history[index + 1];
            const diff = previous ? entry.kg - previous.kg : null;
            return (
              <li key={entry.id}>
                <span>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span>
                <strong>{kgLabel(entry.kg)}</strong>
                <small>{diff === null ? "" : `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`}</small>
                <button type="button" onClick={() => remove(entry)} aria-label={`Supprimer la pesée du ${shortDate(entry.date)}`}><Icon name="trash" size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {history.length > 5 && (
        <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Afficher moins" : `Afficher les ${history.length} pesées`}
        </button>
      )}
    </section>
  );
}

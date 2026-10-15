import { useMemo, useState } from "react";
import Icon from "./Icon";
import { addDays } from "../lib/planning";
import type { AppData } from "../lib/storage";
import { reportWeekStart, weeklyReport, type ReportTargets, type WeekFigures } from "../lib/weeklyReport";

type WeeklyReportCardProps = {
  data: AppData;
  targets: ReportTargets;
  today: string;
};

const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const fmt = (value: number | null, unit: string, digits = 0) => (value === null ? "—" : `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${unit}`);

/** Évolution par rapport à la semaine d'avant (sans jugement : juste le sens). */
function Change({ now, before, unit, digits = 0 }: { now: number | null; before: number | null; unit: string; digits?: number }) {
  if (now === null || before === null) return <small className="report-change">—</small>;
  const diff = Math.round((now - before) * 10 ** digits) / 10 ** digits;
  if (diff === 0) return <small className="report-change">=</small>;
  return <small className="report-change">{diff > 0 ? "+" : "−"}{Math.abs(diff).toLocaleString("fr-FR")} {unit}</small>;
}

const rows = (week: WeekFigures, previous: WeekFigures, waterGoal: number) => [
  { label: "Jours notés", now: fmt(week.daysLogged, "/ 7"), change: <Change now={week.daysLogged} before={previous.daysLogged} unit="j" /> },
  { label: "Calories / jour", now: fmt(week.kcal === null ? null : Math.round(week.kcal), "kcal"), change: <Change now={week.kcal === null ? null : Math.round(week.kcal)} before={previous.kcal === null ? null : Math.round(previous.kcal)} unit="kcal" /> },
  { label: "Protéines / jour", now: fmt(week.protein === null ? null : Math.round(week.protein), "g"), change: <Change now={week.protein === null ? null : Math.round(week.protein)} before={previous.protein === null ? null : Math.round(previous.protein)} unit="g" /> },
  { label: "Fibres / jour", now: fmt(week.fiber === null ? null : Math.round(week.fiber), "g"), change: <Change now={week.fiber === null ? null : Math.round(week.fiber)} before={previous.fiber === null ? null : Math.round(previous.fiber)} unit="g" /> },
  { label: "Hydratation", now: `${week.waterDays} j ≥ ${(waterGoal / 1000).toLocaleString("fr-FR")} L`, change: <Change now={week.waterMl === null ? null : Math.round(week.waterMl / 10) * 10} before={previous.waterMl === null ? null : Math.round(previous.waterMl / 10) * 10} unit="ml" /> },
  { label: "Pas / jour", now: fmt(week.steps === null ? null : Math.round(week.steps), ""), change: <Change now={week.steps === null ? null : Math.round(week.steps)} before={previous.steps === null ? null : Math.round(previous.steps)} unit="" /> },
  { label: "Sport", now: week.sessions ? `${week.sessions} séance${week.sessions > 1 ? "s" : ""} · ${week.sessionMinutes} min` : "—", change: <Change now={week.sessionMinutes} before={previous.sessionMinutes} unit="min" /> },
  { label: "Poids (moy. 7 j)", now: fmt(week.weight, "kg", 1), change: <Change now={week.weight} before={previous.weight} unit="kg" digits={1} /> },
];

/** Bilan de la semaine, avec les semaines précédentes (historique). */
export default function WeeklyReportCard({ data, targets, today }: WeeklyReportCardProps) {
  const latest = reportWeekStart(today);
  const [start, setStart] = useState(latest);
  const report = useMemo(() => weeklyReport(data, targets, start), [data, targets, start]);
  const firstMeal = data.meals.reduce<string | null>((first, meal) => (first === null || meal.date < first ? meal.date : first), null);
  const canGoBack = !!firstMeal && addDays(start, -1) >= firstMeal;

  return (
    <section className="section-block weekly-report" id="bilan-semaine">
      <div className="section-title">
        <div><p className="eyebrow">Bilan</p><h2>Ma semaine</h2></div>
      </div>
      <div className="report-nav">
        <button type="button" className="icon-button" disabled={!canGoBack} onClick={() => setStart(addDays(start, -7))} aria-label="Semaine précédente"><Icon name="chevron" size={16} /></button>
        <strong>du {day(report.week.start)} au {day(report.week.end)}</strong>
        <button type="button" className="icon-button report-next" disabled={start >= latest} onClick={() => setStart(addDays(start, 7))} aria-label="Semaine suivante"><Icon name="chevron" size={16} /></button>
      </div>

      {report.insufficient ? (
        <p className="report-empty">Données insuffisantes : {report.week.daysLogged} jour{report.week.daysLogged > 1 ? "s" : ""} noté{report.week.daysLogged > 1 ? "s" : ""} cette semaine. Le bilan a besoin d'au moins 4 jours pour dire quelque chose de juste.</p>
      ) : (
        <>
          <div className="report-block good">
            <p className="report-title">Ce qui va bien</p>
            <ul>{report.good.map((text) => <li key={text}>{text}</li>)}</ul>
          </div>
          {report.improve.length > 0 && (
            <div className="report-block improve">
              <p className="report-title">À améliorer</p>
              <ul>
                {report.improve.map((item) => (
                  <li key={item.text}>{item.text}<small>👉 {item.action}</small></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="report-table" role="table" aria-label="Chiffres de la semaine, et écart avec la semaine précédente">
        {rows(report.week, report.previous, targets.waterMl).map((row) => (
          <div className="report-row" role="row" key={row.label}>
            <span role="cell">{row.label}</span>
            <strong role="cell">{row.now}</strong>
            <span role="cell">{row.change}</span>
          </div>
        ))}
      </div>
      <small className="report-note">Écarts : comparés à la semaine précédente. Fibres : seulement les aliments dont on les connaît (repère 30 g/jour).</small>
    </section>
  );
}

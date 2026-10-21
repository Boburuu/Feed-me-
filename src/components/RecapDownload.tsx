import { useMemo, useState } from "react";
import Icon from "./Icon";
import { addDays } from "../lib/planning";
import { buildRecap, type RecapSections } from "../lib/recap";
import { saveRecapPdf, shareSavedRecap, type SavedRecap } from "../lib/recapPdf";
import { todayKey, type AppData } from "../lib/storage";

type RecapDownloadProps = {
  data: AppData;
  person: string;
  flash: (message: string) => void;
};

type Period = "jour" | "hier" | "semaine" | "semaine-1" | "mois" | "30j" | "debut" | "dates";

const monday = (day: string) => addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7));

/** Premier jour avec quelque chose de noté (repas, eau, pas, sport, poids, jeûne). */
export function firstDay(data: AppData, today: string) {
  const days = [
    ...data.meals.map((meal) => meal.date),
    ...Object.keys(data.water ?? {}),
    ...Object.keys(data.steps ?? {}),
    ...data.sessions.map((session) => session.date),
    ...data.weights.map((entry) => entry.date),
    ...data.fasts.map((fast) => todayKey(new Date(fast.start))),
  ].filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today);
  return days.length ? days.reduce((a, b) => (a < b ? a : b)) : today;
}

/** Début et fin d'une période prédéfinie. */
function rangeOf(period: Period, today: string, from: string, to: string, first: string) {
  switch (period) {
    case "jour": return { from: today, to: today };
    case "hier": return { from: addDays(today, -1), to: addDays(today, -1) };
    case "semaine": return { from: monday(today), to: today };
    case "semaine-1": return { from: addDays(monday(today), -7), to: addDays(monday(today), -1) };
    case "mois": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "30j": return { from: addDays(today, -29), to: today };
    case "debut": return { from: first, to: today };
    default: return from <= to ? { from, to } : { from: to, to: from };
  }
}

const periods: [Period, string][] = [["jour", "Aujourd'hui"], ["hier", "Hier"], ["semaine", "Cette semaine"], ["semaine-1", "Semaine dernière"], ["mois", "Ce mois"], ["30j", "30 derniers jours"], ["debut", "Depuis le début"], ["dates", "Dates au choix"]];
const contents: [keyof RecapSections, string][] = [["summary", "Résumé et moyennes"], ["meals", "Repas"], ["nutrients", "Protéines, glucides, lipides"], ["water", "Hydratation"], ["activity", "Pas et sport"], ["weight", "Poids"], ["fasting", "Jeûne"]];

/** Télécharger un récapitulatif en PDF : la période, puis ce qu'il contient. */
export default function RecapDownload({ data, person, flash }: RecapDownloadProps) {
  const today = todayKey();
  const [period, setPeriod] = useState<Period>("semaine");
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [sections, setSections] = useState<RecapSections>({ summary: true, meals: true, nutrients: true, water: true, activity: true, weight: true, fasting: true });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedRecap | null>(null);
  const range = rangeOf(period, today, from, to, firstDay(data, today));
  const recap = useMemo(() => buildRecap(data, range), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const nothing = !Object.values(sections).some(Boolean);

  const download = async () => {
    setBusy(true);
    try {
      setSaved(await saveRecapPdf(recap, sections, person));
    } catch (problem) {
      console.error("Récap PDF", problem);
      flash(`Le PDF n'a pas pu être créé : ${problem instanceof Error ? problem.message : String(problem)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recap-download">
      <p className="eyebrow">Période</p>
      <div className="container-chips" role="radiogroup" aria-label="Période">
        {periods.map(([id, label]) => (
          <button type="button" role="radio" aria-checked={period === id} key={id} className={period === id ? "selected" : ""} onClick={() => setPeriod(id)}>{label}</button>
        ))}
      </div>
      {period === "dates" && (
        <div className="meal-composer-when">
          <label>Du<input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Au<input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      <p className="eyebrow">Contenu</p>
      <div className="recap-contents">
        {contents.map(([key, label]) => (
          <label className="awake-toggle" key={key}>
            <input type="checkbox" checked={sections[key]} onChange={(e) => setSections((current) => ({ ...current, [key]: e.target.checked }))} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p className="food-hint">
        {recap.days.length
          ? `${recap.days.length} jour${recap.days.length > 1 ? "s" : ""} avec des données${recap.summary.freeDays ? `, dont ${recap.summary.freeDays} libre${recap.summary.freeDays > 1 ? "s" : ""}` : ""}.`
          : "Rien de noté sur cette période."}
      </p>
      {saved && (
        <div className="recap-saved" role="status">
          <strong>✓ PDF enregistré dans {saved.place}</strong>
          <small>{saved.fileName}</small>
          {saved.place === "Téléchargements" && saved.uri && <small>Retrouve-le dans l'app « Mes fichiers », dossier Téléchargements (ou Download).</small>}
          {saved.uri && <button type="button" className="plan-confirm" onClick={() => void shareSavedRecap(saved).catch(() => flash("Partage impossible"))}><Icon name="share" size={14} /> Partager (mail, WhatsApp, Drive…)</button>}
        </div>
      )}
      <button type="button" className="submit-button" onClick={() => void download()} disabled={busy || nothing}>
        <Icon name="download" /> {busy ? "Création du PDF…" : saved ? "Télécharger à nouveau" : "Télécharger le PDF"}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Icon from "./Icon";
import {
  openHealthConnect,
  phoneCounterAvailable,
  requestStepsAccess,
  startPhoneCounter,
  stepGoals,
  stepsAvailability,
  stopPhoneCounter,
  type StepsAvailability,
} from "../lib/steps";
import { todayKey, type AppData, type StepsSource } from "../lib/storage";

type StepsPanelProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  /** Relit les pas depuis la source choisie ; renvoie le nombre de jours mis à jour. */
  onSync: (source?: StepsSource) => Promise<number>;
  flash: (message: string) => void;
};

const n = (value: number) => value.toLocaleString("fr-FR");
const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `à ${new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};
const sourceLabel = { phone: "podomètre du téléphone", health: "Health Connect" } as const;

export default function StepsPanel({ data, update, onSync, flash }: StepsPanelProps) {
  const today = todayKey();
  const entry = data.steps[today];
  const source = data.stepsSource;
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);
  const [health, setHealth] = useState<StepsAvailability | null>(null);
  const [manual, setManual] = useState(entry?.source === "manuel" ? String(entry.count) : "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    phoneCounterAvailable().then(setPhoneAvailable);
    stepsAvailability().then(setHealth);
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    try {
      await action();
    } catch {
      setProblem("Les pas n'ont pas pu être lus. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  };

  const choosePhone = () => run(async () => {
    const days = await startPhoneCounter();
    if (!days) {
      setProblem("L'autorisation « Activité physique » a été refusée. Vous pouvez la donner dans Paramètres → Applications → Feed Me → Autorisations.");
      return;
    }
    update((current) => ({ ...current, stepsSource: "phone" }));
    await onSync("phone");
    flash("Podomètre activé");
  });

  const chooseHealth = () => run(async () => {
    if (!(await requestStepsAccess())) {
      setProblem("L'accès aux pas n'a pas été autorisé dans Health Connect.");
      return;
    }
    if (source === "phone") await stopPhoneCounter().catch(() => undefined);
    update((current) => ({ ...current, stepsSource: "health" }));
    await onSync("health");
    flash("Pas lus depuis Health Connect");
  });

  const stop = () => run(async () => {
    if (source === "phone") await stopPhoneCounter().catch(() => undefined);
    update((current) => ({ ...current, stepsSource: null }));
  });

  const saveManual = (event: React.FormEvent) => {
    event.preventDefault();
    const count = Math.round(Number(manual.replace(/\s/g, "")));
    if (!Number.isFinite(count) || count < 0 || count > 100_000) {
      setProblem("Indiquez un nombre de pas entre 0 et 100 000.");
      return;
    }
    update((current) => ({ ...current, steps: { ...current.steps, [today]: { count, source: "manuel", updatedAt: new Date().toISOString() } } }));
    flash("Pas enregistrés");
  };

  return (
    <div className="steps-panel">
      <div className="steps-today">
        <span className="metric-icon"><Icon name="shoe" /></span>
        <div>
          <strong>{entry ? n(entry.count) : "—"}</strong>
          <small>
            {entry
              ? `pas aujourd'hui · ${entry.source === "auto" && source ? `${sourceLabel[source]}, ${ago(entry.updatedAt)}` : "saisis à la main"}`
              : "Aucun pas pour aujourd'hui"}
          </small>
        </div>
      </div>

      {native && source && (
        <div className="steps-sync">
          <p><Icon name="check" size={15} /> Pas comptés automatiquement ({sourceLabel[source]}).</p>
          {source === "phone" && <small className="steps-note">Le compte commence à l'activation : les pas faits avant ne sont connus que si le téléphone a redémarré depuis minuit.</small>}
          <div className="steps-actions">
            <button type="button" className="add-button" onClick={() => run(async () => { await onSync(); flash("Pas actualisés"); })} disabled={busy}>
              {busy ? <span className="loader" /> : <Icon name="download" size={15} />} Actualiser
            </button>
            <button type="button" className="text-button" onClick={stop} disabled={busy}>Arrêter</button>
          </div>
        </div>
      )}

      {native && !source && (
        <div className="steps-sync">
          <p>Comptez vos pas automatiquement avec le <strong>capteur du téléphone</strong>, comme une appli podomètre. Il fonctionne même app fermée et consomme très peu de batterie.</p>
          <button type="button" className="submit-button" onClick={choosePhone} disabled={busy || phoneAvailable === false}>
            {busy ? <span className="loader" /> : <Icon name="shoe" size={17} />} Compter mes pas
          </button>
          {phoneAvailable === false && <small className="steps-note">Ce téléphone n'a pas de capteur de pas.</small>}
          {health === "available" && (
            <details className="steps-help">
              <summary>Utiliser plutôt Samsung Health / Health Connect</summary>
              <p>Si Samsung Health partage déjà vos pas avec Health Connect (Samsung Health → Paramètres → Health Connect), l'app peut les lire directement, y compris l'historique.</p>
              <button type="button" className="add-button" onClick={chooseHealth} disabled={busy}><Icon name="download" size={15} /> Lire depuis Health Connect</button>
            </details>
          )}
          {health === "not-installed" && phoneAvailable === false && (
            <button type="button" className="add-button" onClick={openHealthConnect}><Icon name="download" size={15} /> Installer Health Connect</button>
          )}
        </div>
      )}
      {problem && <p className="form-error" role="alert">{problem}</p>}

      <form className="steps-manual" onSubmit={saveManual}>
        <label>
          <span>{source ? "Corriger les pas d'aujourd'hui" : "Pas faits aujourd'hui"}</span>
          <div><input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="Ex. 7 500" /><small>pas</small></div>
        </label>
        <button type="submit" className="add-button" disabled={!manual.trim()}><Icon name="check" size={15} /> Enregistrer</button>
      </form>

      <div className="steps-goal">
        <span>Objectif quotidien</span>
        <div className="chip-row">
          {stepGoals.map((goal) => (
            <button type="button" key={goal} className={data.stepGoal === goal ? "selected" : ""} onClick={() => update((current) => ({ ...current, stepGoal: goal }))}>{n(goal)}</button>
          ))}
        </div>
        <small>Les études récentes trouvent l'essentiel du bénéfice pour la santé entre 6 000 et 8 000 pas par jour.</small>
      </div>
    </div>
  );
}

import Icon from "./Icon";
import { goals, programsForGoal } from "../lib/goals";
import { activityLevels, bmi, healthyRange, idealWeight, paceOptions } from "../lib/nutrition";
import { parseDraft, withGoal, type PlanDraft } from "../lib/planDraft";
import type { Sex } from "../lib/storage";

type PlanEditorProps = {
  value: PlanDraft;
  onChange: (draft: PlanDraft) => void;
  sections: ("body" | "goal")[];
};

const kg = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function PlanEditor({ value, onChange, sections }: PlanEditorProps) {
  const set = (change: Partial<PlanDraft>) => onChange({ ...value, ...change });
  const { body } = parseDraft(value);
  const bodyKnown = body.height >= 120 && body.weight >= 35;
  const range = bodyKnown ? healthyRange(body.height) : null;
  const currentBmi = bodyKnown ? bmi(body.weight, body.height) : 0;
  const ideal = bodyKnown ? idealWeight(body.height) : 0;

  // Raccourcis : poids idéal, haut de la zone de forme, et paliers de la HAS
  // (viser d'abord −5 à −15 % du poids initial).
  const round = (n: number) => Math.round(n * 10) / 10;
  const shortcuts: { label: string; kg: number }[] = [];
  if (bodyKnown && value.goal === "perte") {
    if (ideal < body.weight) shortcuts.push({ label: "Poids idéal", kg: ideal });
    if (range && range.max < body.weight) shortcuts.push({ label: "Haut du poids de forme", kg: range.max });
    if (currentBmi >= 27) shortcuts.push({ label: "−5 %", kg: round(body.weight * 0.95) }, { label: "−10 %", kg: round(body.weight * 0.9) });
  }
  if (bodyKnown && value.goal === "prise") {
    if (ideal > body.weight) shortcuts.push({ label: "Poids idéal", kg: ideal });
    shortcuts.push({ label: "+2 kg", kg: round(body.weight + 2) }, { label: "+5 kg", kg: round(body.weight + 5) });
  }

  return (
    <div className="plan-editor">
      {sections.includes("body") && (
        <fieldset className="plan-group">
          <legend>Mon profil physique</legend>
          <div className="sex-selector" role="radiogroup" aria-label="Sexe utilisé par la formule">
            {(["femme", "homme"] as Sex[]).map((sex) => (
              <button type="button" role="radio" aria-checked={value.sex === sex} key={sex} className={value.sex === sex ? "selected" : ""} onClick={() => set({ sex })}>
                {sex === "femme" ? "Femme" : "Homme"}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label><span>Âge</span><div><input type="number" inputMode="numeric" value={value.age} onChange={(e) => set({ age: e.target.value })} placeholder="29" /><small>ans</small></div></label>
            <label><span>Taille</span><div><input type="number" inputMode="numeric" value={value.height} onChange={(e) => set({ height: e.target.value })} placeholder="168" /><small>cm</small></div></label>
            <label><span>Poids</span><div><input type="number" inputMode="decimal" step="0.1" value={value.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="62" /><small>kg</small></div></label>
          </div>
          <p className="plan-label">Sport et activité quotidienne</p>
          <div className="option-list" role="radiogroup" aria-label="Niveau d'activité">
            {activityLevels.map((level) => (
              <button type="button" role="radio" aria-checked={value.activity === level.value} key={level.value} className={value.activity === level.value ? "selected" : ""} onClick={() => set({ activity: level.value })}>
                <i className="radio-dot" />
                <span><strong>{level.label}</strong><small>{level.detail}</small></span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {sections.includes("goal") && (
        <fieldset className="plan-group">
          <legend>Mon objectif</legend>
          <div className="goal-options" role="radiogroup" aria-label="Objectif">
            {goals.map((goal) => (
              <button type="button" role="radio" aria-checked={value.goal === goal.id} key={goal.id} className={value.goal === goal.id ? "selected" : ""} onClick={() => onChange(withGoal(value, goal.id))}>
                <Icon name={goal.icon} size={20} />
                <strong>{goal.label}</strong>
                <small>{goal.detail}</small>
              </button>
            ))}
          </div>

          {value.goal !== "maintien" && (
            <>
              <div className="form-grid single">
                <label><span>Poids cible</span><div><input type="number" inputMode="decimal" step="0.1" value={value.targetWeight} onChange={(e) => set({ targetWeight: e.target.value })} placeholder={bodyKnown ? kg(ideal) : "60"} /><small>kg</small></div></label>
              </div>
              {shortcuts.length > 0 && (
                <div className="chip-row">
                  {shortcuts.map((item) => (
                    <button type="button" key={item.label} className={Number(value.targetWeight) === item.kg ? "selected" : ""} onClick={() => set({ targetWeight: String(item.kg) })}>
                      {item.label} · {kg(item.kg)} kg
                    </button>
                  ))}
                </div>
              )}
              {range && (
                <p className="plan-hint">
                  Pour {body.height} cm, votre <strong>poids idéal est d'environ {kg(ideal)} kg</strong> (IMC 22, poids de référence de l'EFSA). Tout poids entre {kg(range.min)} et {kg(range.max)} kg est un poids de forme selon l'OMS.
                  {value.goal === "perte" && currentBmi >= 30 && " La HAS conseille de viser d'abord une perte de 5 à 15 % : c'est déjà très bénéfique pour la santé."}
                </p>
              )}

              <p className="plan-label">Rythme visé</p>
              <div className="pace-options" role="radiogroup" aria-label="Rythme visé">
                {paceOptions[value.goal].map((pace) => (
                  <button type="button" role="radio" aria-checked={value.pace === pace} key={pace} className={value.pace === pace ? "selected" : ""} onClick={() => set({ pace })}>
                    <strong>{pace.toLocaleString("fr-FR")} kg</strong>
                    <small>{pace > 0.5 ? "rapide" : "par semaine"}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="plan-label">Ma méthode</p>
          <div className="option-list" role="radiogroup" aria-label="Méthode">
            {programsForGoal(value.goal).map((program) => (
              <button type="button" role="radio" aria-checked={value.program === program.id} key={program.id} className={value.program === program.id ? "selected" : ""} onClick={() => set({ program: program.id })}>
                <i className="radio-dot" />
                <span>
                  <strong>{program.label}</strong>
                  <small>{program.description}</small>
                  {program.caution && value.program === program.id && <small className="caution">{program.caution}</small>}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

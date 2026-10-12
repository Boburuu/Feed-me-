import { bmiCategory, healthyRange, otherFormulas, sources, type PlanResult } from "../lib/nutrition";
import type { GoalType, Sex } from "../lib/storage";

type PlanResultsProps = {
  result: PlanResult;
  body: { sex: Sex; age: number; height: number; weight: number };
  goal: GoalType;
  targetWeight: number | null;
  /** Masque l'explication détaillée (aperçu pendant la création du profil). */
  compact?: boolean;
};

const n = (value: number, digits = 0) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
const longDate = (date: Date) => date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

export default function PlanResults({ result, body, goal, targetWeight, compact = false }: PlanResultsProps) {
  const { bmr, pal, maintenance, target, delta, weeklyChange, limitedBy, weeksToTarget, targetDate, macros } = result;
  const range = healthyRange(body.height);
  const deltaLabel = goal === "prise" ? "Surplus quotidien" : "Déficit quotidien";

  return (
    <section className="plan-results" aria-live="polite">
      <div className="plan-target">
        <p className="eyebrow">{goal === "maintien" ? "Calories pour garder votre poids" : "Calories pour atteindre votre objectif"}</p>
        <strong>{n(target)}</strong>
        <span>kcal par jour</span>
      </div>

      <div className="plan-tiles">
        <div><small>{result.usesObserved ? "Maintien (mesuré)" : "Maintien du poids"}</small><strong>{n(maintenance)} kcal</strong></div>
        {goal === "maintien" ? (
          <div><small>Métabolisme de base</small><strong>{n(bmr)} kcal</strong></div>
        ) : (
          <div><small>{deltaLabel}</small><strong>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{n(Math.abs(delta))} kcal</strong></div>
        )}
      </div>

      <p className="plan-explain">
        {result.usesObserved
          ? <>Votre besoin d'entretien est mesuré à partir de vos repas et de vos pesées. </>
          : <>Votre métabolisme de base est d'environ <strong>{n(bmr)} kcal</strong> par jour. Avec votre niveau d'activité (coefficient {n(pal, 1)}), vous dépensez environ <strong>{n(maintenance)} kcal</strong>. </>}
        {goal !== "maintien" && weeklyChange > 0 && (
          <>Avec {delta < 0 ? "un déficit" : "un surplus"} de {n(Math.abs(delta))} kcal, vous {goal === "perte" ? "perdrez" : "prendrez"} environ <strong>{n(weeklyChange, 2)} kg par semaine</strong>
            {targetWeight && weeksToTarget && targetDate ? <> et atteindrez {n(targetWeight, 1)} kg vers <strong>{longDate(targetDate)}</strong> ({weeksToTarget} semaines).</> : "."}</>
        )}
      </p>

      {limitedBy === "plafond" && <p className="plan-warning">Rythme ajusté : la HAS recommande un déficit de 15 à 30 % de vos besoins au plus, soit 1 à 2 kg par mois. Aller plus vite fait surtout perdre du muscle.</p>}
      {limitedBy === "metabolisme" && <p className="plan-warning">Rythme ajusté : manger moins que votre métabolisme de base ({n(bmr)} kcal) n'est pas recommandé sans suivi médical.</p>}
      {limitedBy === "mineur" && <p className="plan-warning">Avant 18 ans, un régime ne doit pas être suivi sans avis médical : l'objectif reste le maintien.</p>}

      <div className="plan-tiles three">
        <div><small>IMC</small><strong>{n(result.bmi, 1)}</strong><em>{bmiCategory(result.bmi)}</em></div>
        <div><small>Poids de forme</small><strong>{n(range.min, 1)}–{n(range.max, 1)}</strong><em>kg (IMC 18,5–25)</em></div>
        <div><small>Protéines</small><strong>{macros.protein} g</strong><em>par jour</em></div>
      </div>

      {!compact && (
        <>
          <div className="macro-bar" aria-label={`Répartition indicative : ${macros.protein} g de protéines, ${macros.fat} g de lipides, ${macros.carbs} g de glucides`}>
            <span style={{ flex: macros.protein * 4 }} className="protein" />
            <span style={{ flex: macros.fat * 9 }} className="fat" />
            <span style={{ flex: macros.carbs * 4 }} className="carbs" />
          </div>
          <div className="macro-legend">
            <span><i className="protein" />Protéines {macros.protein} g</span>
            <span><i className="fat" />Lipides {macros.fat} g</span>
            <span><i className="carbs" />Glucides {macros.carbs} g</span>
          </div>

          {result.bmi >= 30 && goal === "perte" && (
            <p className="plan-note">Avec un IMC de 30 ou plus, la HAS recommande un accompagnement par votre médecin traitant, qui peut vous orienter vers un diététicien.</p>
          )}

          <details className="plan-details">
            <summary>Pourquoi les sites donnent des chiffres différents ?</summary>
            <p>Chaque site choisit une formule de métabolisme de base et un coefficient d'activité différents. Pour vous :</p>
            <table>
              <thead><tr><th>Formule</th><th>Métabolisme</th><th>× {n(pal, 1)}</th></tr></thead>
              <tbody>
                {otherFormulas(body).map((formula) => (
                  <tr key={formula.name}><td>{formula.name}<small>{formula.note}</small></td><td>{n(formula.bmr)}</td><td>{n(Math.round(formula.bmr * pal / 10) * 10)}</td></tr>
                ))}
              </tbody>
            </table>
            <p>Beaucoup de calculateurs utilisent aussi 1,2 pour « sédentaire », alors que les mesures de l'EFSA donnent plutôt 1,4. Aucune formule n'est exacte pour une personne : l'erreur est d'environ ±10 %, davantage en cas d'obésité.</p>
            <p><strong>La méthode la plus fiable</strong> : suivre l'objectif 3 à 4 semaines, en notant repas et pesées. L'app calcule alors votre besoin réel et vous propose de l'utiliser.</p>
            <p className="plan-sources">Sources :</p>
            <ul>
              {sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

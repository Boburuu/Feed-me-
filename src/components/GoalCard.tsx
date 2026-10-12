import Icon from "./Icon";
import { goals, programFor } from "../lib/goals";
import { idealWeight, type PlanResult } from "../lib/nutrition";
import type { Plan } from "../lib/storage";

type GoalCardProps = {
  plan: Plan;
  result: PlanResult;
  currentWeight: number;
  height: number;
  onOpen: () => void;
};

const kg = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function GoalCard({ plan, result, currentWeight, height, onOpen }: GoalCardProps) {
  const ideal = idealWeight(height);
  const toIdeal = currentWeight - ideal;
  const goal = goals.find((item) => item.id === plan.goal)!;
  const program = programFor(plan.program);
  const change = currentWeight - plan.startWeight;
  const target = plan.targetWeight;

  let progress = 0;
  let headline = "";
  let detail = "";
  if (plan.goal !== "maintien" && target) {
    const total = target - plan.startWeight;
    progress = total ? Math.max(0, Math.min(1, change / total)) : 0;
    const left = Math.abs(target - currentWeight);
    const done = plan.goal === "perte" ? -change : change;
    headline = done > 0 ? `${plan.goal === "perte" ? "−" : "+"}${kg(done)} kg depuis le début` : "C'est parti !";
    detail = progress >= 1 ? `Objectif de ${kg(target)} kg atteint, bravo !` : `Encore ${kg(left)} kg pour atteindre ${kg(target)} kg`;
  } else {
    headline = Math.abs(change) < 0.1 ? "Poids stable" : `${change > 0 ? "+" : "−"}${kg(Math.abs(change))} kg depuis le début`;
    detail = Math.abs(change) <= 2 ? "Dans la zone de stabilité (±2 kg)" : "Hors de la zone de stabilité (±2 kg) : ajustez vos portions";
    progress = Math.max(0, 1 - Math.abs(change) / 2);
  }

  // Paliers HAS : −5 % puis −10 % du poids de départ.
  const milestone = plan.goal === "perte" && target
    ? [0.95, 0.9].map((ratio) => Math.round(plan.startWeight * ratio * 10) / 10).find((value) => value > target && currentWeight > value)
    : undefined;

  const eta = result.targetDate && progress < 1 && plan.goal !== "maintien"
    ? `vers ${result.targetDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} à ce rythme`
    : null;

  return (
    <button className="goal-card" onClick={onOpen}>
      <span className="goal-card-head">
        <span className="metric-icon"><Icon name={goal.icon} /></span>
        <span><small>Mon objectif</small><strong>{goal.label}</strong></span>
        <span className="current-theme">{program.short}</span>
      </span>
      <strong className="goal-card-headline">{headline}</strong>
      <span className="goal-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>
      <small className="goal-card-detail">{detail}{eta && ` · ${eta}`}</small>
      <span className="goal-card-ideal">
        <span><small>Poids actuel</small><strong>{kg(currentWeight)} kg</strong></span>
        <span><small>Poids idéal</small><strong>{kg(ideal)} kg</strong></span>
        <span><small>Écart</small><strong>{Math.abs(toIdeal) < 0.1 ? "Atteint" : `${toIdeal > 0 ? "−" : "+"}${kg(Math.abs(toIdeal))} kg`}</strong></span>
      </span>
      {milestone && <small className="goal-card-milestone"><Icon name="target" size={13} /> Prochain palier : {kg(milestone)} kg (−{Math.round((1 - milestone / plan.startWeight) * 100)} %)</small>}
    </button>
  );
}

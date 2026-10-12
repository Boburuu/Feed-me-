// Brouillon du formulaire « profil physique + objectif », partagé entre la création
// du profil et l'écran Profil. Les nombres restent en texte tant qu'on tape.

import { programsForGoal } from "./goals";
import { healthyRange, idealWeight, paceOptions } from "./nutrition";
import { limits, validateBody, type GoalType, type Plan, type ProgramId, type Profile, type Sex } from "./storage";

export type PlanDraft = {
  sex: Sex;
  age: string;
  height: string;
  weight: string;
  activity: string;
  goal: GoalType;
  program: ProgramId;
  targetWeight: string;
  pace: number;
};

export function draftFrom(profile: Pick<Profile, "sex" | "age" | "height" | "weight" | "activity">, plan: Pick<Plan, "goal" | "program" | "targetWeight" | "pace">): PlanDraft {
  return {
    sex: profile.sex,
    age: profile.age ? String(profile.age) : "",
    height: profile.height ? String(profile.height) : "",
    weight: profile.weight ? String(profile.weight) : "",
    activity: profile.activity,
    goal: plan.goal,
    program: plan.program,
    targetWeight: plan.targetWeight ? String(plan.targetWeight) : "",
    pace: plan.pace,
  };
}

const num = (text: string) => Number(text.replace(",", "."));

export function parseDraft(draft: PlanDraft) {
  const target = num(draft.targetWeight);
  return {
    body: { sex: draft.sex, age: num(draft.age), height: num(draft.height), weight: Math.round(num(draft.weight) * 10) / 10, activity: draft.activity },
    plan: {
      goal: draft.goal,
      program: draft.program,
      targetWeight: draft.goal === "maintien" || !target ? null : Math.round(target * 10) / 10,
      pace: draft.pace,
    },
  };
}

/**
 * Poids cible proposé par défaut : le poids idéal (IMC 22), s'il va dans le sens de
 * l'objectif. Sinon on laisse le champ vide.
 */
export function suggestedTarget(draft: PlanDraft) {
  const { body } = parseDraft(draft);
  if (!(body.height >= limits.height.min && body.weight >= limits.weight.min)) return "";
  const ideal = idealWeight(body.height);
  if (draft.goal === "perte" && ideal < body.weight) return String(ideal);
  if (draft.goal === "prise" && ideal > body.weight) return String(ideal);
  return "";
}

/** Préremplit le poids cible s'il est vide. */
export function withSuggestedTarget(draft: PlanDraft): PlanDraft {
  return draft.targetWeight.trim() ? draft : { ...draft, targetWeight: suggestedTarget(draft) };
}

/** Change d'objectif en gardant un programme et un rythme compatibles. */
export function withGoal(draft: PlanDraft, goal: GoalType): PlanDraft {
  const programs = programsForGoal(goal);
  const paces = paceOptions[goal];
  return withSuggestedTarget({
    ...draft,
    // Le poids cible d'une perte n'a pas de sens pour une prise, et inversement.
    targetWeight: goal === draft.goal ? draft.targetWeight : "",
    goal,
    program: programs.some((item) => item.id === draft.program) ? draft.program : programs[0].id,
    pace: paces.includes(draft.pace) ? draft.pace : goal === "prise" ? 0.25 : 0.5,
  });
}

export function bodyErrors(draft: PlanDraft) {
  const { body } = parseDraft(draft);
  return validateBody(body);
}

export function goalErrors(draft: PlanDraft) {
  const { body, plan } = parseDraft(draft);
  if (draft.goal === "maintien") return [];
  const target = plan.targetWeight;
  if (!target || target < limits.weight.min || target > limits.weight.max) return ["Indiquez le poids que vous souhaitez atteindre."];
  if (draft.goal === "perte") {
    if (target >= body.weight) return ["Pour perdre du poids, le poids cible doit être inférieur au poids actuel."];
    const { min } = healthyRange(body.height);
    if (target < min) {
      return [`${target.toLocaleString("fr-FR")} kg correspond à un IMC inférieur à 18,5 (maigreur selon l'OMS). Choisissez au moins ${min.toLocaleString("fr-FR")} kg.`];
    }
  }
  if (draft.goal === "prise" && target <= body.weight) return ["Pour prendre du muscle, le poids cible doit être supérieur au poids actuel."];
  return [];
}

// Calcul des besoins énergétiques.
//
// Aucune formule n'est fiable à 100 % : l'erreur individuelle est d'environ ±10 %,
// davantage en cas d'obésité. On retient donc les références officielles :
// - métabolisme de base : équations de Henry (2005), retenues par l'EFSA (Autorité
//   européenne de sécurité des aliments, 2013) et par le SACN (Royaume-Uni, 2011) ;
// - niveaux d'activité physique (NAP) de l'EFSA : 1,4 / 1,6 / 1,8 / 2,0 ;
// - perte de poids : déficit plafonné à 30 % des besoins et rythme de 1 à 2 kg par mois
//   (HAS, surpoids et obésité de l'adulte) ;
// puis on corrige avec les données réelles de l'utilisateur (repas + pesées).

import type { GoalType, Meal, Plan, ProgramId, Sex, WeightEntry } from "./storage";

export const KCAL_PER_MJ = 239.006;
/** Approximation classique : 1 kg de masse grasse ≈ 7 700 kcal. */
export const KCAL_PER_KG = 7700;
/** Déficit ou surplus maximal, en part des besoins (HAS : 15 à 30 %). */
const MAX_DEFICIT_SHARE = 0.3;

export const activityLevels = [
  { value: "1.4", label: "Sédentaire", detail: "Travail assis, peu ou pas de sport" },
  { value: "1.6", label: "Modérément actif", detail: "Sport 1 à 3 fois par semaine, ou métier debout" },
  { value: "1.8", label: "Actif", detail: "Sport 4 à 5 fois par semaine, ou métier physique" },
  { value: "2.0", label: "Très actif", detail: "Sport intensif 6 à 7 fois par semaine, ou métier très physique" },
];

/** Anciennes valeurs (coefficients Mifflin) converties vers les NAP de l'EFSA. */
export const legacyActivity: Record<string, string> = { "1.2": "1.4", "1.375": "1.6", "1.55": "1.8", "1.725": "2.0" };

type Body = { sex: Sex; age: number; height: number; weight: number };

// Henry (2005), version poids (kg) + taille (m), résultat en MJ/jour.
const henry: Record<Sex, { maxAge: number; w: number; h: number; c: number }[]> = {
  homme: [
    { maxAge: 30, w: 0.06, h: 1.31, c: 0.473 },
    { maxAge: 60, w: 0.0476, h: 2.26, c: -0.574 },
    { maxAge: Infinity, w: 0.0478, h: 2.26, c: -1.07 },
  ],
  femme: [
    { maxAge: 30, w: 0.0433, h: 2.57, c: -1.18 },
    { maxAge: 60, w: 0.0342, h: 2.1, c: -0.0486 },
    { maxAge: Infinity, w: 0.0356, h: 1.76, c: 0.0448 },
  ],
};

export function henryBmr({ sex, age, height, weight }: Body) {
  const row = henry[sex].find((item) => age < item.maxAge)!;
  return (row.w * weight + row.h * (height / 100) + row.c) * KCAL_PER_MJ;
}

/** Autres formules courantes, pour expliquer pourquoi les sites ne donnent pas le même chiffre. */
export function otherFormulas(body: Body) {
  const { sex, age, height, weight } = body;
  const male = sex === "homme";
  return [
    { name: "Henry / Oxford (2005)", note: "Référence EFSA et SACN, utilisée ici", bmr: henryBmr(body) },
    { name: "Mifflin-St Jeor (1990)", note: "Très utilisée par les applis américaines", bmr: 10 * weight + 6.25 * height - 5 * age + (male ? 5 : -161) },
    {
      name: "Black et al. (1996)",
      note: "Courante en France (ANC 2001)",
      bmr: (male ? 1.083 : 0.963) * weight ** 0.48 * (height / 100) ** 0.5 * age ** -0.13 * KCAL_PER_MJ,
    },
    {
      name: "Harris & Benedict (1919)",
      note: "La plus ancienne, tend à surestimer",
      bmr: male ? 66.473 + 13.7516 * weight + 5.0033 * height - 6.755 * age : 655.0955 + 9.5634 * weight + 1.8496 * height - 4.6756 * age,
    },
  ];
}

// --- IMC (OMS) -----------------------------------------------------------------

export function bmi(weight: number, height: number) {
  return weight / (height / 100) ** 2;
}

export function bmiCategory(value: number) {
  if (value < 18.5) return "Maigreur";
  if (value < 25) return "Corpulence normale";
  if (value < 30) return "Surpoids";
  if (value < 35) return "Obésité modérée";
  if (value < 40) return "Obésité sévère";
  return "Obésité massive";
}

export function healthyRange(height: number) {
  const square = (height / 100) ** 2;
  return { min: Math.ceil(18.5 * square * 10) / 10, max: Math.floor(24.9 * square * 10) / 10 };
}

/**
 * Poids « idéal » : IMC 22, milieu de la zone de corpulence normale de l'OMS.
 * C'est aussi le poids de référence retenu par l'EFSA, et il est très proche de la
 * formule de Lorentz utilisée en France.
 */
export function idealWeight(height: number) {
  return Math.round(22 * (height / 100) ** 2 * 10) / 10;
}

// --- Plan --------------------------------------------------------------------

export const paceOptions: Record<GoalType, number[]> = {
  perte: [0.25, 0.5, 0.75],
  maintien: [],
  prise: [0.25, 0.5],
};

const proteinPerKg: Record<ProgramId, number> = { equilibre: 1, jeune: 1, seche: 1.8, masse: 1.6 };

export type PlanResult = {
  bmr: number;
  pal: number;
  maintenance: number;
  /** Calories à consommer par jour pour suivre l'objectif. */
  target: number;
  /** Négatif = déficit, positif = surplus. */
  delta: number;
  /** Rythme réellement obtenu après plafonnement, en kg / semaine. */
  weeklyChange: number;
  limitedBy: "plafond" | "metabolisme" | "mineur" | null;
  weeksToTarget: number | null;
  targetDate: Date | null;
  bmi: number;
  macros: { protein: number; fat: number; carbs: number };
  usesObserved: boolean;
};

const round10 = (value: number) => Math.round(value / 10) * 10;

export function computePlan(body: Body & { activity: string }, plan: Pick<Plan, "goal" | "targetWeight" | "pace" | "program" | "customMaintenance">): PlanResult {
  const pal = Number(body.activity) || 1.4;
  const bmr = henryBmr(body);
  const usesObserved = !!plan.customMaintenance;
  const maintenance = round10(plan.customMaintenance ?? bmr * pal);
  const floor = Math.max(bmr, body.sex === "homme" ? 1500 : 1200);

  let delta = 0;
  let limitedBy: PlanResult["limitedBy"] = null;
  if (plan.goal !== "maintien") {
    const wanted = (plan.pace * KCAL_PER_KG) / 7;
    const cap = maintenance * MAX_DEFICIT_SHARE;
    delta = Math.min(wanted, cap);
    if (wanted > cap) limitedBy = "plafond";
    if (plan.goal === "perte") {
      if (body.age < 18) {
        delta = 0;
        limitedBy = "mineur";
      } else if (maintenance - delta < floor) {
        delta = Math.max(0, maintenance - floor);
        limitedBy = "metabolisme";
      }
      delta = -delta;
    }
  }
  const target = round10(maintenance + delta);
  delta = target - maintenance;
  const weeklyChange = (Math.abs(delta) * 7) / KCAL_PER_KG;

  let weeksToTarget: number | null = null;
  let targetDate: Date | null = null;
  if (plan.goal !== "maintien" && plan.targetWeight && weeklyChange > 0) {
    weeksToTarget = Math.ceil(Math.abs(body.weight - plan.targetWeight) / weeklyChange);
    targetDate = new Date(Date.now() + weeksToTarget * 7 * 86_400_000);
  }

  // Protéines rapportées au poids « de référence » (IMC 25 au plus) pour ne pas
  // surestimer les besoins en cas de surpoids ; lipides 35 % (ANSES : 35-40 %) ; glucides : le reste.
  const referenceWeight = Math.min(body.weight, 25 * (body.height / 100) ** 2);
  const protein = Math.round(referenceWeight * (plan.goal === "maintien" && plan.program === "equilibre" ? 0.83 : proteinPerKg[plan.program]));
  const fat = Math.round((target * 0.35) / 9);
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));

  return {
    bmr: Math.round(bmr),
    pal,
    maintenance,
    target,
    delta,
    weeklyChange,
    limitedBy,
    weeksToTarget,
    targetDate,
    bmi: bmi(body.weight, body.height),
    macros: { protein, fat, carbs },
    usesObserved,
  };
}

// --- Besoin réel observé --------------------------------------------------------
// Si on mange en moyenne X kcal et que le poids baisse de Y kg par jour, la
// dépense réelle vaut X + Y × 7 700. C'est la méthode la plus fiable : elle se base
// sur vous, pas sur une moyenne de population.

export type Observed =
  | { ready: true; maintenance: number; days: number; loggedDays: number; weeklyChange: number }
  | { ready: false; reason: string };

const DAY = 86_400_000;
const dayNumber = (date: string) => Math.round(new Date(`${date}T12:00:00`).getTime() / DAY);

export function observedMaintenance(meals: Meal[], weights: WeightEntry[], today: string): Observed {
  const end = dayNumber(today);
  const start = end - 28;
  const recentWeights = weights.filter((entry) => dayNumber(entry.date) > start).sort((a, b) => a.date.localeCompare(b.date));
  if (recentWeights.length < 3) return { ready: false, reason: "Il faut au moins 3 pesées sur les 4 dernières semaines." };
  const span = dayNumber(recentWeights.at(-1)!.date) - dayNumber(recentWeights[0].date);
  if (span < 14) return { ready: false, reason: "Les pesées doivent couvrir au moins 2 semaines." };

  const first = dayNumber(recentWeights[0].date);
  const perDay = new Map<number, number>();
  meals.forEach((meal) => {
    const day = dayNumber(meal.date);
    if (day >= first && day < end) perDay.set(day, (perDay.get(day) ?? 0) + meal.calories);
  });
  // Un jour à moins de 800 kcal est sans doute incomplet : on l'ignore.
  const logged = [...perDay.values()].filter((total) => total >= 800);
  const window = end - first;
  if (logged.length < Math.max(10, window * 0.7)) {
    return { ready: false, reason: `Notez tous vos repas pendant au moins ${Math.max(10, Math.ceil(window * 0.7))} jours (actuellement ${logged.length}).` };
  }

  // Tendance du poids par régression linéaire : moins sensible aux variations d'eau.
  const xs = recentWeights.map((entry) => dayNumber(entry.date));
  const ys = recentWeights.map((entry) => entry.kg);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0) / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const intake = logged.reduce((a, b) => a + b, 0) / logged.length;

  return {
    ready: true,
    maintenance: round10(intake - slope * KCAL_PER_KG),
    days: window,
    loggedDays: logged.length,
    weeklyChange: slope * 7,
  };
}

export const sources = [
  { label: "EFSA (2013) – Valeurs nutritionnelles de référence pour l'énergie", url: "https://www.efsa.europa.eu/en/efsajournal/pub/3005" },
  { label: "Henry (2005) – Équations du métabolisme de base", url: "https://pubmed.ncbi.nlm.nih.gov/16277825/" },
  { label: "HAS – Surpoids et obésité de l'adulte", url: "https://www.has-sante.fr/jcms/c_964938/fr/surpoids-et-obesite-de-l-adulte-prise-en-charge-medicale-de-premier-recours" },
  { label: "Manger Bouger (PNNS) – Repères alimentaires", url: "https://www.mangerbouger.fr" },
];

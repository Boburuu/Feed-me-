// Objectifs, programmes et conseils. Les conseils reprennent les repères du PNNS
// (mangerbouger.fr) et de la HAS ; ils restent généraux et ne remplacent pas un suivi médical.

import type { GoalType, ProgramId } from "./storage";
import type { IconName } from "../components/Icon";

export const goals: { id: GoalType; label: string; detail: string; icon: IconName }[] = [
  { id: "perte", label: "Perdre du poids", detail: "Atteindre un poids cible à un rythme durable", icon: "scale" },
  { id: "maintien", label: "Garder mon poids", detail: "Manger équilibré et rester stable", icon: "target" },
  { id: "prise", label: "Prendre du muscle", detail: "Léger surplus et apport en protéines", icon: "flame" },
];

export type Program = {
  id: ProgramId;
  label: string;
  short: string;
  goals: GoalType[];
  description: string;
  caution?: string;
  tasks: string[];
  tips: string[];
};

const baseTips = [
  "Visez au moins 5 portions de fruits et légumes par jour.",
  "Préférez les féculents complets : pain, riz ou pâtes complets.",
  "Des légumineuses (lentilles, pois chiches, haricots) au moins 2 fois par semaine.",
  "L'eau est la seule boisson indispensable : gardez une bouteille à portée de main.",
  "Limitez les boissons sucrées, la charcuterie et les produits ultra-transformés.",
  "Au moins 30 minutes d'activité physique dynamique par jour, même en plusieurs fois.",
  "Mangez lentement : le signal de satiété met une vingtaine de minutes à arriver.",
];

export const programs: Program[] = [
  {
    id: "equilibre",
    label: "Rééquilibrage alimentaire",
    short: "Rééquilibrage",
    goals: ["perte", "maintien", "prise"],
    description: "Manger de tout en ajustant les quantités. C'est l'approche recommandée par la HAS pour une perte de poids durable.",
    tasks: ["30 min de marche rapide", "Séance de renforcement 20 min", "5 fruits et légumes aujourd'hui"],
    tips: baseTips,
  },
  {
    id: "jeune",
    label: "Jeûne intermittent 16:8",
    short: "Jeûne 16:8",
    goals: ["perte", "maintien"],
    description: "16 heures sans manger, puis une fenêtre de 8 heures pour les repas. Il aide surtout parce qu'il réduit les occasions de manger : les calories de la fenêtre comptent toujours.",
    caution: "Déconseillé en cas de grossesse, de diabète traité ou d'antécédents de troubles du comportement alimentaire : demandez l'avis d'un médecin.",
    tasks: ["Respecter ma fenêtre de 8 h", "15 min de marche après le repas", "1,5 L d'eau pendant le jeûne"],
    tips: [
      "Pendant le jeûne, l'eau, le thé et le café sans sucre sont permis.",
      "Rompez le jeûne avec un vrai repas (protéines + légumes), pas un grignotage sucré.",
      "Les calories de la fenêtre comptent toujours : le jeûne ne compense pas un excès.",
      "Commencez par 12:12 ou 14:10 si 16 heures vous semblent difficiles.",
      "Un vertige ou un malaise ? Mangez et reprenez plus doucement.",
    ],
  },
  {
    id: "seche",
    label: "Sèche",
    short: "Sèche",
    goals: ["perte"],
    description: "Perdre du gras en gardant le muscle : déficit modéré, beaucoup de protéines et musculation régulière. Adaptée aux personnes sportives déjà proches de leur poids de forme.",
    caution: "Avec un IMC élevé, le rééquilibrage alimentaire est plus adapté pour commencer.",
    tasks: ["Musculation 45 min", "10 000 pas", "Protéines à chaque repas"],
    tips: [
      "Gardez des protéines à chaque repas pour préserver vos muscles.",
      "Maintenez la musculation 3 fois par semaine : c'est elle qui protège la masse musculaire.",
      "Un déficit trop fort fait perdre du muscle : restez sur un rythme modéré.",
      "Dormez 7 à 9 h : le manque de sommeil augmente la faim.",
      "Mesurez votre tour de taille : il baisse parfois même quand la balance stagne.",
    ],
  },
  {
    id: "masse",
    label: "Prise de masse propre",
    short: "Prise de masse",
    goals: ["prise"],
    description: "Un léger surplus calorique et un bon apport en protéines pour construire du muscle sans trop de gras.",
    tasks: ["Musculation 60 min", "Augmenter une charge", "Collation protéinée"],
    tips: [
      "Un léger surplus (+250 à +500 kcal) limite la prise de gras.",
      "Répartissez les protéines sur 3 à 4 repas dans la journée.",
      "Augmentez régulièrement les charges : c'est le signal qui fait grossir le muscle.",
      "Collations utiles : fromage blanc, oléagineux, banane, œufs.",
      "Visez une prise de 1 à 2 kg par mois au plus.",
    ],
  },
];

export const goalTips: Record<GoalType, string[]> = {
  perte: [
    "Pesez-vous une fois par semaine, à la même heure : le poids varie d'un jour à l'autre (eau, sel).",
    "Remplissez la moitié de l'assiette avec des légumes.",
    "Un écart n'annule pas la semaine : reprenez simplement au repas suivant.",
    "Perdre 5 à 10 % de son poids améliore déjà nettement la santé (HAS).",
  ],
  maintien: ["Une variation de ±1 à 2 kg est normale : ne réagissez qu'à une tendance sur plusieurs semaines."],
  prise: ["Pesez-vous une fois par semaine : au-delà de 0,5 kg par semaine, c'est surtout du gras."],
};

export function programFor(id: ProgramId) {
  return programs.find((item) => item.id === id) ?? programs[0];
}

export function programsForGoal(goal: GoalType) {
  return programs.filter((item) => item.goals.includes(goal));
}

/** Un conseil différent chaque jour, tiré du programme et de l'objectif. */
export function tipOfTheDay(goal: GoalType, program: ProgramId, date = new Date()) {
  const list = [...programFor(program).tips, ...goalTips[goal]];
  const day = Math.floor(date.getTime() / 86_400_000);
  return list[day % list.length];
}

import type { IconName } from "../components/Icon";
import type { Session, SessionType } from "./storage";

/** OMS : au moins 150 min d'activité modérée par semaine (ou 75 min intense). */
export const WEEKLY_ACTIVITY_GOAL = 150;

export const sessionTypes: { id: SessionType; label: string; icon: IconName }[] = [
  { id: "marche", label: "Marche", icon: "walk" },
  { id: "course", label: "Course", icon: "run" },
  { id: "velo", label: "Vélo", icon: "bike" },
  { id: "natation", label: "Natation", icon: "swim" },
  { id: "muscu", label: "Musculation", icon: "barbell" },
  { id: "yoga", label: "Yoga / étirements", icon: "lotus" },
  { id: "danse", label: "Danse", icon: "music" },
  { id: "autre", label: "Autre", icon: "dots" },
];

export const sessionLabel = (type: SessionType) => sessionTypes.find((item) => item.id === type)?.label ?? "Séance";

/** Minutes « équivalent modéré » : une minute intense en vaut deux. */
export const sessionCredit = (session: Session) => session.minutes * (session.intense ? 2 : 1);

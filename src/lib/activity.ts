import type { IconName } from "../components/Icon";
import type { Session, SessionType } from "./storage";

/** OMS : au moins 150 min d'activité modérée par semaine (ou 75 min intense). */
export const WEEKLY_ACTIVITY_GOAL = 150;

export const sessionTypes: { id: SessionType; label: string; icon: IconName }[] = [
  { id: "marche", label: "Marche", icon: "shoe" },
  { id: "course", label: "Course", icon: "shoe" },
  { id: "velo", label: "Vélo", icon: "target" },
  { id: "natation", label: "Natation", icon: "water" },
  { id: "muscu", label: "Musculation", icon: "flame" },
  { id: "yoga", label: "Yoga / étirements", icon: "users" },
  { id: "danse", label: "Danse", icon: "users" },
  { id: "autre", label: "Autre", icon: "plus" },
];

export const sessionLabel = (type: SessionType) => sessionTypes.find((item) => item.id === type)?.label ?? "Séance";

/** Minutes « équivalent modéré » : une minute intense en vaut deux. */
export const sessionCredit = (session: Session) => session.minutes * (session.intense ? 2 : 1);

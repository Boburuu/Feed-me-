// Pas : lecture automatique via Health Connect (Android), sinon saisie manuelle.
//
// Health Connect est le service santé d'Android. Samsung Health, Google Fit, les
// montres connectées… y partagent leurs pas ; l'app ne fait que les lire, avec
// l'autorisation de l'utilisateur. Rien n'est écrit dans Health Connect.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { Health } from "capacitor-health";
import { todayKey } from "./storage";

export const stepGoals = [6000, 8000, 10000, 12000];

// Le module est importé directement : renvoyé par une fonction async, l'objet du
// plugin Capacitor serait pris pour une promesse (« HealthPlugin.then() is not implemented »).
const plugin = () => Health;

export type StepsAvailability = "available" | "not-installed" | "unsupported";

/** Health Connect est-il présent sur ce téléphone ? */
export async function stepsAvailability(): Promise<StepsAvailability> {
  if (Capacitor.getPlatform() !== "android") return "unsupported";
  try {
    const { available } = await plugin().isHealthAvailable();
    return available ? "available" : "not-installed";
  } catch {
    return "unsupported";
  }
}

const granted = (response: { permissions: Record<string, boolean>[] }) =>
  response.permissions.some((item) => Object.values(item).some(Boolean));

/** Ouvre la fenêtre d'autorisation de Health Connect. Renvoie true si les pas sont autorisés. */
export async function requestStepsAccess() {
  return granted(await plugin().requestHealthPermissions({ permissions: ["READ_STEPS"] }));
}

export async function hasStepsAccess() {
  try {
    return granted(await plugin().checkHealthPermissions({ permissions: ["READ_STEPS"] }));
  } catch {
    return false;
  }
}

export async function openHealthConnect() {
  const health = plugin();
  try {
    await health.openHealthConnectSettings();
  } catch {
    await health.showHealthConnectInPlayStore();
  }
}

/** Pas des `days` derniers jours, par jour (AAAA-MM-JJ), à partir de minuit heure locale. */
export async function readSteps(days = 7): Promise<Record<string, number>> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const { aggregatedData } = await plugin().queryAggregated({
    startDate: start.toISOString(),
    endDate: new Date().toISOString(),
    dataType: "steps",
    bucket: "day",
  });
  const result: Record<string, number> = {};
  for (const sample of aggregatedData) {
    // Le jour d'un échantillon : son début, en heure locale (+1 h pour ne pas basculer la veille).
    const day = todayKey(new Date(new Date(sample.startDate).getTime() + 3_600_000));
    result[day] = (result[day] ?? 0) + Math.round(sample.value);
  }
  return result;
}

// --- Podomètre du téléphone (module natif de l'app, comme WeWard) -------------------------
// Le capteur de pas compte en permanence au niveau matériel. Un relevé toutes les
// 15 min environ (tâche de fond Android) suffit à calculer les pas de chaque jour.

type StepCounterPlugin = {
  isAvailable(): Promise<{ available: boolean; granted: boolean }>;
  requestAccess(): Promise<{ granted: boolean }>;
  start(): Promise<{ days: Record<string, number> }>;
  stop(): Promise<void>;
  getSteps(): Promise<{ days: Record<string, number> }>;
};
const StepCounter = registerPlugin<StepCounterPlugin>("StepCounter");

export async function phoneCounterAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await StepCounter.isAvailable()).available;
  } catch {
    return false;
  }
}

/** Demande l'autorisation « Activité physique » puis lance le relevé en arrière-plan. */
export async function startPhoneCounter() {
  const { granted } = await StepCounter.requestAccess();
  if (!granted) return null;
  return (await StepCounter.start()).days;
}

export const stopPhoneCounter = () => StepCounter.stop();

/** Pas des derniers jours comptés par le téléphone (relevé fait à l'instant). */
export async function readPhoneSteps(days = 7) {
  const all = (await StepCounter.getSteps()).days;
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - (days - 1));
  const from = todayKey(oldest);
  return Object.fromEntries(Object.entries(all).filter(([day]) => day >= from));
}

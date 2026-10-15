// Rappels (notifications locales, programmées sur le téléphone, sans serveur) :
// - pesée : jours et heure choisis (cahier v2 § 2) ;
// - bilan de la semaine : dimanche soir ou lundi matin (§ 3) ;
// - repas prévus : à l'heure du moment de repas, pour le confirmer (§ 9).
// Dans le navigateur (version iPhone), les notifications programmées n'existent pas.

import { Capacitor } from "@capacitor/core";
import { isPlanned } from "./planning";
import type { AppData, Meal, MealCategory } from "./storage";

export type ReminderSettings = {
  weigh?: { enabled: boolean; days: number[]; time: string };
  weekly?: { enabled: boolean; when: "dimanche-soir" | "lundi-matin" };
  planned?: { enabled: boolean };
};

/** Jours de la semaine, du lundi au dimanche (0 = dimanche, comme Date.getDay). */
export const WEEK_DAYS = [
  { day: 1, short: "lun." }, { day: 2, short: "mar." }, { day: 3, short: "mer." }, { day: 4, short: "jeu." },
  { day: 5, short: "ven." }, { day: 6, short: "sam." }, { day: 0, short: "dim." },
];

export const defaultReminders: Required<ReminderSettings> = {
  weigh: { enabled: false, days: [1], time: "07:30" },
  weekly: { enabled: false, when: "dimanche-soir" },
  planned: { enabled: false },
};

/** Heure du rappel d'un repas prévu, selon le moment. */
const mealTimes: Record<MealCategory, [number, number]> = { "petit-dejeuner": [8, 0], dejeuner: [12, 15], collation: [16, 0], diner: [19, 30] };

export const remindersAvailable = () => Capacitor.isNativePlatform();

export type ReminderTarget = "pesee" | "bilan" | "prevu";
type Planned = { id: number; title: string; body: string; at: Date; target: ReminderTarget } | { id: number; title: string; body: string; on: { weekday: number; hour: number; minute: number }; target: ReminderTarget };

/** Notifications à programmer (fonction pure, testée). */
export function plannedNotifications(data: Pick<AppData, "meals"> & { reminders?: ReminderSettings }, now = new Date()): Planned[] {
  const settings = { ...defaultReminders, ...data.reminders };
  const list: Planned[] = [];
  if (settings.weigh.enabled) {
    const [hour, minute] = settings.weigh.time.split(":").map(Number);
    for (const day of settings.weigh.days) {
      list.push({ id: 100 + day, title: "Pesée du jour", body: "À jeun, après les toilettes : 10 secondes pour noter ton poids.", on: { weekday: day + 1, hour, minute }, target: "pesee" });
    }
  }
  if (settings.weekly.enabled) {
    const sunday = settings.weekly.when === "dimanche-soir";
    list.push({ id: 200, title: "Ton bilan de la semaine est prêt", body: "Ce qui va bien, ce qui peut s'améliorer : jette un œil !", on: { weekday: sunday ? 1 : 2, hour: sunday ? 19 : 9, minute: 0 }, target: "bilan" });
  }
  if (settings.planned.enabled) {
    const soon = data.meals
      .filter((meal): meal is Meal => isPlanned(meal))
      .map((meal) => {
        const [hour, minute] = mealTimes[meal.category];
        const at = new Date(`${meal.date}T00:00:00`);
        at.setHours(hour, minute, 0, 0);
        return { meal, at };
      })
      .filter(({ at }) => at > now && at.getTime() - now.getTime() < 8 * 86_400_000)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 40);
    soon.forEach(({ meal, at }, index) => {
      list.push({ id: 1000 + index, title: "Repas prévu", body: `${meal.name} : mangé tel quel ? Confirme-le dans Feed Me.`, at, target: "prevu" });
    });
  }
  return list;
}

const TARGET_KEY = "feedme:notification-touchee";
export const REMINDER_EVENT = "feedme:notification-touchee";

/** Reprogramme tous les rappels (à chaque changement de réglage ou de repas prévu). */
export async function syncReminders(data: Pick<AppData, "meals"> & { reminders?: ReminderSettings }) {
  if (!remindersAvailable()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
  const list = plannedNotifications(data);
  if (!list.length) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return;
  await LocalNotifications.schedule({
    notifications: list.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      smallIcon: "ic_stat_feedme",
      extra: { target: item.target },
      // Rappel à quelques minutes près : pas besoin de l'autorisation « alarmes exactes ».
      isExactNotification: false,
      schedule: "at" in item ? { at: item.at, allowWhileIdle: true } : { on: item.on, allowWhileIdle: true },
    })),
  });
}

/** Demande l'autorisation d'afficher des notifications (au premier rappel activé). */
export async function askReminderPermission() {
  if (!remindersAvailable()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const permission = await LocalNotifications.requestPermissions();
  return permission.display === "granted";
}

/** Au démarrage : une notification touchée ouvre le bon écran (même derrière le code). */
export async function listenForReminderTaps() {
  if (!remindersAvailable()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    const target = notification.extra?.target as ReminderTarget | undefined;
    if (!target) return;
    try { sessionStorage.setItem(TARGET_KEY, target); } catch { /* lu par l'événement */ }
    window.dispatchEvent(new CustomEvent(REMINDER_EVENT, { detail: target }));
  });
}

export function takeReminderTarget(): ReminderTarget | null {
  try {
    const target = sessionStorage.getItem(TARGET_KEY) as ReminderTarget | null;
    sessionStorage.removeItem(TARGET_KEY);
    return target;
  } catch {
    return null;
  }
}

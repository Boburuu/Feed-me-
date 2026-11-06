import { describe, expect, it } from "vitest";
import { alarmDaysLabel, ALL_DAYS, plannedNotifications, type Alarm } from "./reminders";

const alarm = (change: Partial<Alarm> = {}): Alarm => ({ id: 1, label: "Noter mon repas", time: "12:05", days: [1, 3], enabled: true, open: "repas", ...change });

describe("alarmes", () => {
  it("programme une notification par jour choisi, à l'heure choisie", () => {
    const list = plannedNotifications({ meals: [], reminders: { alarms: [alarm()] } });
    expect(list).toHaveLength(2);
    expect(list.map((item) => "on" in item && item.on)).toEqual([{ weekday: 2, hour: 12, minute: 5 }, { weekday: 4, hour: 12, minute: 5 }]);
    expect(list[0]).toMatchObject({ title: "Noter mon repas", target: "repas" });
  });

  it("ignore une alarme désactivée", () => {
    expect(plannedNotifications({ meals: [], reminders: { alarms: [alarm({ enabled: false })] } })).toEqual([]);
  });

  it("donne un identifiant différent à chaque notification", () => {
    const list = plannedNotifications({ meals: [], reminders: { alarms: [alarm({ days: ALL_DAYS }), alarm({ id: 2, days: ALL_DAYS, time: "19:30" })], weigh: { enabled: true, days: ALL_DAYS, time: "07:30" }, weekly: { enabled: true, when: "lundi-matin" } } });
    expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
  });

  it("n'ajoute rien aux données sans alarme", () => {
    expect(plannedNotifications({ meals: [] })).toEqual([]);
  });

  it("résume les jours en clair", () => {
    expect(alarmDaysLabel(ALL_DAYS)).toBe("Tous les jours");
    expect(alarmDaysLabel([1, 2, 3, 4, 5])).toBe("Du lundi au vendredi");
    expect(alarmDaysLabel([0, 6])).toBe("Le week-end");
    expect(alarmDaysLabel([3, 1])).toBe("lun., mer.");
  });
});

// Section 8 : poids (moyenne 7 j), bilan de la semaine, conseil du jour, rappels.
import { describe, expect, it } from "vitest";
import { plannedNotifications } from "./reminders";
import type { AppData, Meal, WeightEntry } from "./storage";
import { dailyTip, tips, tipThemes } from "./tips";
import { currentAverage, trend, withMovingAverage } from "./weight";
import { reportWeekStart, weeklyReport, type ReportTargets } from "./weeklyReport";

const w = (date: string, kg: number, id = Number(date.replace(/-/g, ""))): WeightEntry => ({ id, date, kg });

describe("poids : moyenne sur 7 jours", () => {
  const weights = [w("2026-10-01", 80), w("2026-10-03", 81), w("2026-10-06", 79), w("2026-10-10", 78.6), w("2026-10-14", 78)];

  it("chaque pesée avec la moyenne des 7 jours qui finissent ce jour-là", () => {
    const points = withMovingAverage(weights);
    expect(points[2]).toMatchObject({ date: "2026-10-06", kg: 79, average: 80 }); // 80, 81, 79
    expect(points[4]).toMatchObject({ date: "2026-10-14", average: 78.3 }); // 78,6 et 78
  });

  it("tendance : écart des moyennes, ramené à la semaine", () => {
    expect(trend(withMovingAverage(weights))).toEqual({ change: -1.7, perWeek: -0.92, days: 13 });
    expect(trend(withMovingAverage(weights.slice(0, 2)))).toBeNull();
  });

  it("moyenne 7 j du moment (null sans pesée récente)", () => {
    expect(currentAverage(weights, "2026-10-14")).toBe(78.3);
    expect(currentAverage(weights, "2026-11-30")).toBeNull();
  });
});

// Une semaine du lundi 5 au dimanche 11 octobre 2026, et la précédente.
const meal = (id: number, date: string, calories: number, protein = 20): Meal => ({ id, date, category: "dejeuner", name: "Repas", calories, protein, source: "manual" });
const base = { meals: [] as Meal[], water: {}, weights: [] as WeightEntry[], steps: {}, stepGoal: 8000, sessions: [], hydrationCoefficients: undefined } as unknown as AppData;
const targets: ReportTargets = { kcal: 1800, protein: 90, waterMl: 1600, stepGoal: 8000, goal: "maintien" };

describe("bilan de la semaine", () => {
  it("moins de 4 jours notés : données insuffisantes, aucun conseil", () => {
    const data = { ...base, meals: [meal(1, "2026-10-05", 1800), meal(2, "2026-10-06", 1700), meal(3, "2026-10-07", 1900)] };
    const report = weeklyReport(data, targets, "2026-10-05");
    expect(report.insufficient).toBe(true);
    expect(report.good).toEqual([]);
    expect(report.improve).toEqual([]);
  });

  it("semaine notée : d'abord ce qui va bien, puis des pistes avec une action", () => {
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    const meals = days.flatMap((day, i) => [meal(i * 10 + 1, day, 600, 15), meal(i * 10 + 2, day, 600, 15), meal(i * 10 + 3, day, 600, 15)]);
    const report = weeklyReport({ ...base, meals, water: Object.fromEntries(days.map((day) => [day, 800])) }, targets, "2026-10-05");
    expect(report.insufficient).toBe(false);
    expect(report.good.length).toBeGreaterThanOrEqual(1);
    expect(report.good.length).toBeLessThanOrEqual(4);
    expect(report.good.join(" ")).toMatch(/7 jours sur 7/);
    expect(report.improve.length).toBeLessThanOrEqual(3);
    expect(report.improve.every((item) => item.action.length > 10)).toBe(true);
    // 45 g de protéines pour 90 visés, 800 ml d'eau pour 1,6 L : deux pistes concrètes.
    expect(report.improve.map((item) => item.text).join(" ")).toMatch(/protéines/);
    expect(report.improve.map((item) => item.text).join(" ")).toMatch(/hydratation/);
  });

  it("maintien : une petite variation de poids n'est jamais une alerte", () => {
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    const data = { ...base, meals: days.map((day, i) => meal(i + 1, day, 1800, 90)), weights: [w("2026-10-02", 70), w("2026-10-11", 70.3)] };
    const report = weeklyReport(data, targets, "2026-10-05");
    expect(report.improve.map((item) => item.text).join(" ")).not.toMatch(/poids/i);
    expect(report.good.join(" ")).toMatch(/Poids stable/);
  });

  it("semaine du bilan : la semaine en cours le dimanche, la précédente sinon", () => {
    expect(reportWeekStart("2026-10-11")).toBe("2026-10-05"); // dimanche
    expect(reportWeekStart("2026-10-14")).toBe("2026-10-05"); // mercredi suivant
  });
});

describe("conseil du jour", () => {
  it("au moins 100 conseils, tous classés dans un thème", () => {
    expect(tips.length).toBeGreaterThanOrEqual(100);
    expect(tips.every((tip) => tip.theme in tipThemes && tip.text.length > 20)).toBe(true);
    expect(new Set(tips.map((tip) => tip.text)).size).toBe(tips.length);
  });

  it("le même toute la journée, un autre le lendemain, tous vus en un cycle", () => {
    expect(dailyTip("2026-10-15")).toBe(dailyTip("2026-10-15"));
    expect(dailyTip("2026-10-16")).not.toBe(dailyTip("2026-10-15"));
    const seen = new Set(Array.from({ length: tips.length }, (_, i) => dailyTip(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)).id));
    expect(seen.size).toBe(tips.length);
  });
});

describe("rappels", () => {
  it("pesée le lundi et le jeudi à 7 h 30, bilan le dimanche à 19 h", () => {
    const list = plannedNotifications({ meals: [], reminders: { weigh: { enabled: true, days: [1, 4], time: "07:30" }, weekly: { enabled: true, when: "dimanche-soir" } } });
    expect(list.map((item) => ("on" in item ? item.on : null))).toEqual([{ weekday: 2, hour: 7, minute: 30 }, { weekday: 5, hour: 7, minute: 30 }, { weekday: 1, hour: 19, minute: 0 }]);
  });

  it("repas prévus : à l'heure du moment, seulement à venir", () => {
    const now = new Date("2026-10-15T10:00:00");
    const meals: Meal[] = [
      { id: 1, date: "2026-10-15", category: "dejeuner", name: "Lasagnes", calories: 500, source: "manual", status: "planned" },
      { id: 2, date: "2026-10-15", category: "petit-dejeuner", name: "Passé", calories: 300, source: "manual", status: "planned" },
      { id: 3, date: "2026-10-16", category: "diner", name: "Mangé", calories: 300, source: "manual" },
    ];
    const list = plannedNotifications({ meals, reminders: { planned: { enabled: true } } }, now);
    expect(list).toHaveLength(1);
    expect("at" in list[0] && list[0].at.getHours()).toBe(12);
    expect(list[0].body).toMatch(/Lasagnes/);
  });

  it("rien n'est programmé tant qu'aucun rappel n'est activé", () => {
    expect(plannedNotifications({ meals: [] })).toEqual([]);
  });
});

describe("repas déjà notés : fibres & co. ajoutées", () => {
  it("aliment Ciqual (code simple ou « code:nom ») complété, calories inchangées", async () => {
    const { backfillExtras } = await import("./carbsBackfill");
    const peche = { name: "Pêche", source: "ciqual" as const, ref: "13195:peche", quantity: 207, unit: "g" as const, kcal100: 46, protein100: 0.6 };
    const lentilles = { name: "Lentille corail, sèche", source: "ciqual" as const, ref: "20535", quantity: 80, unit: "g" as const, kcal100: 328, protein100: 27.7 };
    const data = { ...base, recipes: [], meals: [{ ...meal(1, "2026-10-14", 95), items: [peche, lentilles] }] } as unknown as AppData;
    const apply = await backfillExtras(data);
    const after = apply!(data).meals[0];
    expect(after.calories).toBe(95);
    expect(after.items![0].fiber100).not.toBeUndefined();
    expect(after.items![1]).toMatchObject({ fiber100: 15.4, sugars100: 1.29, kcal100: 328 });
    expect(await backfillExtras(apply!(data))).toBeNull();
  });
});

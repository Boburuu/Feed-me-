// Récapitulatif PDF et repas libre (cheat meal).
import { describe, expect, it } from "vitest";
import { isFreeDay } from "./freeDays";
import { buildRecap, periodDays } from "./recap";
import { pdfText } from "./recapPdf";
import type { AppData, Meal } from "./storage";
import { weekFigures } from "./weeklyReport";

const meal = (id: number, date: string, calories: number, extra: Partial<Meal> = {}): Meal => ({ id, date, category: "dejeuner", name: `Repas ${id}`, calories, protein: 20, carbs: 50, fat: 10, source: "manual", ...extra });
const data = {
  meals: [
    meal(1, "2026-10-19", 600), meal(2, "2026-10-19", 900, { category: "diner" }),
    meal(3, "2026-10-20", 500), meal(4, "2026-10-20", 0, { category: "diner", name: "Dîner chez papa", free: true, freeEstimate: 900 }),
    meal(5, "2026-10-21", 700, { status: "planned" }),
  ],
  water: { "2026-10-19": 1200 }, waterInMl: true,
  steps: { "2026-10-19": { count: 8000, source: "manuel" } },
  sessions: [{ id: 1, date: "2026-10-20", type: "marche", minutes: 30, intense: false }],
  weights: [{ id: 1, date: "2026-10-19", kg: 86.5 }, { id: 2, date: "2026-10-20", kg: 86.1 }],
  fasts: [], tasks: [],
} as unknown as AppData;

describe("récapitulatif", () => {
  const recap = buildRecap(data, { from: "2026-10-19", to: "2026-10-21" });
  it("garde les jours avec des données, sans les repas prévus", () => {
    expect(recap.days.map((day) => day.date)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(periodDays("2026-10-19", "2026-10-21")).toHaveLength(3);
  });
  it("totaux et moyennes hors jours libres", () => {
    expect(recap.days[0].totals.kcal).toBe(1500);
    expect(recap.summary).toMatchObject({ daysLogged: 1, freeDays: 1, kcal: 1500, sessions: 1, sessionMinutes: 30, weightFirst: 86.5, weightLast: 86.1 });
  });
  it("le repas libre garde son estimation, sans la compter", () => {
    const free = recap.days[1].meals.find((item) => item.free)!;
    expect(free).toMatchObject({ estimate: 900, kcal: 0 });
    expect(recap.days[1].totals.kcal).toBe(500);
  });
  it("texte compatible avec la police du PDF", () => {
    expect(pdfText("≈ 900 kcal → 1 200 ml…")).toBe("~ 900 kcal -> 1 200 ml...");
    expect(pdfText("Œuf · crème brûlée")).toBe("Œuf · crème brûlée");
  });
});

describe("repas libre", () => {
  it("rend le jour libre (et seulement s'il est mangé)", () => {
    expect(isFreeDay(data.meals, "2026-10-20")).toBe(true);
    expect(isFreeDay(data.meals, "2026-10-19")).toBe(false);
  });
  it("sort le jour libre du bilan de la semaine", () => {
    const week = weekFigures(data, "2026-10-19");
    expect(week).toMatchObject({ daysLogged: 1, freeDays: 1, kcal: 1500 });
  });
});

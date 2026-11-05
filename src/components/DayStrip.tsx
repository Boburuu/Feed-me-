import { useEffect, useRef } from "react";
import { eatenMeals } from "../lib/planning";
import type { Meal } from "../lib/storage";
import { todayKey } from "../lib/storage";

const RING = 2 * Math.PI * 15;

const shift = (day: string, count: number) => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return todayKey(date);
};

type DayStripProps = {
  meals: Meal[];
  goal: number;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
};

/** Bande des jours de l'accueil : un anneau par jour, rempli selon les calories mangées. */
export default function DayStrip({ meals, goal, today, selected, onSelect }: DayStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const selectedDay = useRef<HTMLButtonElement>(null);
  const eaten = eatenMeals(meals);
  const days = Array.from({ length: 28 }, (_, index) => shift(today, index - 20));

  useEffect(() => {
    const box = strip.current;
    const day = selectedDay.current;
    if (box && day) box.scrollLeft = day.offsetLeft - box.offsetLeft - box.clientWidth / 2 + day.offsetWidth / 2;
  }, [selected]);

  return (
    <div className="day-strip" ref={strip} role="group" aria-label="Choisir un jour">
      {days.map((day) => {
        const date = new Date(`${day}T12:00:00`);
        const dayMeals = eaten.filter((meal) => meal.date === day);
        const free = dayMeals.some((meal) => meal.free);
        const total = dayMeals.reduce((sum, meal) => sum + meal.calories, 0);
        const ratio = free ? 1 : Math.min(1, total / goal);
        const on = day === selected;
        const stroke = free ? "var(--warm)" : total > goal ? "var(--coral)" : on ? "var(--on-accent)" : "var(--green-text)";
        return (
          <button
            type="button"
            key={day}
            ref={on ? selectedDay : undefined}
            className={`day-chip${on ? " on" : ""}${day === today ? " now" : ""}`}
            onClick={() => onSelect(day)}
            aria-pressed={on}
            aria-label={date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          >
            <small>{date.toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase()}</small>
            <span>
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle className="day-track" cx="18" cy="18" r="15" />
                {ratio > 0 && <circle cx="18" cy="18" r="15" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${ratio * RING} ${RING}`} transform="rotate(-90 18 18)" />}
              </svg>
              <b>{date.getDate()}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

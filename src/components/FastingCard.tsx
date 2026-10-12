import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { Fast } from "../lib/storage";

type FastingCardProps = {
  fasts: Fast[];
  onStart: () => void;
  onStop: () => void;
};

const FAST_HOURS = 16;
const EAT_HOURS = 24 - FAST_HOURS;
const HOUR = 3_600_000;

const duration = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
};
const time = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function FastingCard({ fasts, onStart, onStop }: FastingCardProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const current = fasts.find((fast) => !fast.end);
  const last = [...fasts].filter((fast) => fast.end).sort((a, b) => b.end!.localeCompare(a.end!))[0];
  const weekAgo = now - 7 * 24 * HOUR;
  const completed = fasts.filter((fast) => fast.end && new Date(fast.end).getTime() > weekAgo && new Date(fast.end).getTime() - new Date(fast.start).getTime() >= FAST_HOURS * HOUR).length;

  const elapsed = current ? now - new Date(current.start).getTime() : last ? now - new Date(last.end!).getTime() : 0;
  const goal = (current ? FAST_HOURS : EAT_HOURS) * HOUR;
  const progress = Math.min(1, elapsed / goal);
  const end = new Date((current ? new Date(current.start).getTime() : now - elapsed) + goal);

  return (
    <section className={`fasting-card ${current ? "fasting" : ""}`}>
      <div className="fasting-ring" style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
        <div><strong>{current || last ? duration(elapsed) : "—"}</strong><small>{current ? `sur ${FAST_HOURS} h` : "fenêtre"}</small></div>
      </div>
      <div className="fasting-info">
        <p className="eyebrow">Jeûne 16:8</p>
        <strong>{current ? (progress >= 1 ? "Jeûne réussi !" : "Jeûne en cours") : "Fenêtre repas"}</strong>
        <small>
          {current
            ? progress >= 1 ? "Vous pouvez manger quand vous le souhaitez." : `Fin prévue à ${time(end)}`
            : last ? (progress >= 1 ? "Les 8 h sont passées : pensez à démarrer le jeûne." : `Jusqu'à ${time(end)} environ`) : "Démarrez le jeûne après votre dernier repas."}
        </small>
        <small>{completed} jeûne{completed > 1 ? "s" : ""} de 16 h sur les 7 derniers jours</small>
        <button className={current ? "fasting-button stop" : "fasting-button"} onClick={current ? onStop : onStart}>
          <Icon name={current ? "check" : "clock"} size={16} /> {current ? "Terminer le jeûne" : "Commencer le jeûne"}
        </button>
      </div>
    </section>
  );
}

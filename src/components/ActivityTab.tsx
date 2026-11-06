import { useState } from "react";
import FitNumber from "./FitNumber";
import Icon from "./Icon";
import { sessionCredit as credit, sessionTypes, WEEKLY_ACTIVITY_GOAL as WEEKLY_GOAL } from "../lib/activity";
import { todayKey, type AppData, type Session, type SessionType } from "../lib/storage";

type ActivityTabProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  flash: (message: string) => void;
  /** Ouvre le réglage des pas. */
  onOpenSteps: () => void;
};

const RING_LENGTH = 2 * Math.PI * 43;

const parse = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (key: string, days: number) => { const date = parse(key); date.setDate(date.getDate() + days); return todayKey(date); };

export default function ActivityTab({ data, update, flash, onOpenSteps }: ActivityTabProps) {
  const today = todayKey();
  const [type, setType] = useState<SessionType>("marche");
  const [minutes, setMinutes] = useState("30");
  const [intense, setIntense] = useState(false);
  const [date, setDate] = useState(today);
  const [newTask, setNewTask] = useState("");
  const [showAll, setShowAll] = useState(false);

  const monday = addDays(today, -((parse(today).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const minutesOf = (day: string) => data.sessions.filter((session) => session.date === day).reduce((sum, session) => sum + credit(session), 0);
  const weekTotal = week.reduce((sum, day) => sum + minutesOf(day), 0);
  const weekMax = Math.max(60, ...week.map(minutesOf));
  const sorted = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const tasksDone = data.tasks.filter((task) => task.done).length;
  const stepsToday = data.steps[today]?.count ?? 0;

  const addSession = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Math.round(Number(minutes));
    if (!value || value < 1 || value > 600) {
      flash("Indiquez une durée entre 1 et 600 minutes");
      return;
    }
    const session: Session = { id: Date.now(), date: date > today ? today : date, type, minutes: value, intense };
    update((current) => ({ ...current, sessions: [...current.sessions, session] }));
    flash("Séance enregistrée");
    setDate(today);
  };

  const removeSession = (session: Session) => {
    const label = sessionTypes.find((item) => item.id === session.type)?.label ?? "Séance";
    if (window.confirm(`Supprimer la séance « ${label} » de ${session.minutes} min ?`)) {
      update((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }));
    }
  };

  const addTask = (event: React.FormEvent) => {
    event.preventDefault();
    const label = newTask.trim();
    if (!label) return;
    update((current) => ({ ...current, tasks: [...current.tasks, { id: Date.now(), label, detail: "À planifier", done: false }] }));
    setNewTask("");
  };
  const toggleTask = (id: number) =>
    update((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)) }));
  const deleteTask = (id: number, label: string) => {
    if (window.confirm(`Supprimer le défi « ${label} » ?`)) update((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
  };

  return (
    <div className="content page-content">
      <section className="hc">
        <div className="hc-g ac-hero">
          <span className="kr">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <defs><linearGradient id="kr-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--ring-a)" /><stop offset="1" stopColor="var(--ring-b)" /></linearGradient></defs>
              <circle className="kr-t" cx="50" cy="50" r="43" />
              <circle className="kr-p" cx="50" cy="50" r="43" transform="rotate(-90 50 50)" strokeDasharray={`${Math.min(1, weekTotal / WEEKLY_GOAL) * RING_LENGTH} ${RING_LENGTH}`} />
            </svg>
            <span className="kr-c"><FitNumber>{String(weekTotal)}</FitNumber><small>min sur {WEEKLY_GOAL}</small></span>
          </span>
          <span className="sv-bars ac-bars" role="img" aria-label="Minutes d'activité de la semaine">
            {week.map((day, index) => (
              <span key={day} className={day === today ? "on" : ""}>
                <i style={{ height: `${Math.max(6, (minutesOf(day) / weekMax) * 100)}%` }} className={minutesOf(day) ? "st-ok" : "st-none"} />
                <small>{["L", "M", "M", "J", "V", "S", "D"][index]}</small>
              </span>
            ))}
          </span>
        </div>
        <small className="hc-n">{weekTotal >= WEEKLY_GOAL ? "Repère OMS atteint, bravo !" : `Encore ${WEEKLY_GOAL - weekTotal} min pour le repère OMS`} · une minute intense compte double</small>
      </section>

      <button type="button" className="q ac-steps" onClick={onOpenSteps}>
        <span className="q-i"><Icon name="shoe" size={18} /></span>
        <span className="m-t"><b>{stepsToday ? stepsToday.toLocaleString("fr-FR") : "—"} pas aujourd'hui</b><small>sur {data.stepGoal.toLocaleString("fr-FR")}</small></span>
        <span className="gg"><i style={{ width: `${Math.min(100, (stepsToday / data.stepGoal) * 100)}%` }} /></span>
      </button>

      <section className="sv-card ac-form">
        <h2>J'ai bougé</h2>
        <form className="session-form" onSubmit={addSession}>
          <div className="session-types" role="radiogroup" aria-label="Type d'activité">
            {sessionTypes.map((item) => (
              <button type="button" role="radio" aria-checked={type === item.id} key={item.id} className={type === item.id ? "selected" : ""} onClick={() => setType(item.id)}>
                <Icon name={item.icon} size={20} /><small>{item.label}</small>
              </button>
            ))}
          </div>
          <div className="ac-row">
            <span className="plan-label">Durée</span>
            <div className="ac-stepper">
              <button type="button" onClick={() => setMinutes(String(Math.max(1, (Number(minutes) || 0) - 5)))} aria-label="5 minutes de moins"><Icon name="minus" size={18} /></button>
              <label><input type="number" inputMode="numeric" min="1" max="600" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Durée en minutes" /><small>min</small></label>
              <button type="button" onClick={() => setMinutes(String(Math.min(600, (Number(minutes) || 0) + 5)))} aria-label="5 minutes de plus"><Icon name="plus" size={18} /></button>
            </div>
          </div>
          <div className="ac-days">
            <button type="button" className={date === today ? "selected" : ""} aria-pressed={date === today} onClick={() => setDate(today)}>Aujourd'hui</button>
            <button type="button" className={date === addDays(today, -1) ? "selected" : ""} aria-pressed={date === addDays(today, -1)} onClick={() => setDate(addDays(today, -1))}>Hier</button>
            <label className={date !== today && date !== addDays(today, -1) ? "selected" : ""}><span>Autre jour</span><input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <div className="sex-selector" role="radiogroup" aria-label="Intensité">
            <button type="button" role="radio" aria-checked={!intense} className={!intense ? "selected" : ""} onClick={() => setIntense(false)}>Modérée · on peut parler</button>
            <button type="button" role="radio" aria-checked={intense} className={intense ? "selected" : ""} onClick={() => setIntense(true)}>Intense · essoufflé</button>
          </div>
          <button className="submit-button" type="submit"><Icon name="check" /> Enregistrer la séance</button>
        </form>
      </section>

      {sorted.length > 0 && (
        <section className="section-block">
          <div className="section-title"><div><p className="eyebrow">Historique</p><h2>Mes séances</h2></div></div>
          <div className="meal-list">
            {(showAll ? sorted : sorted.slice(0, 6)).map((session) => {
              const item = sessionTypes.find((entry) => entry.id === session.type)!;
              return (
                <div className="meal-row" key={session.id}>
                  <span className="meal-icon lunch"><Icon name={item.icon} /></span>
                  <span><strong>{item.label}</strong><small>{parse(session.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{session.intense ? " · intense" : ""}</small></span>
                  <span className="meal-calories"><strong>{session.minutes}</strong><small>min</small></span>
                  <button className="icon-button" onClick={() => removeSession(session)} aria-label={`Supprimer la séance du ${session.date}`}><Icon name="trash" size={16} /></button>
                </div>
              );
            })}
          </div>
          {sorted.length > 6 && <button className="text-button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Afficher moins" : `Afficher les ${sorted.length} séances`}</button>}
        </section>
      )}

      <section className="section-block">
        <div className="section-title">
          <div><p className="eyebrow">À faire</p><h2>Mes défis sportifs</h2></div>
          <span className="task-count">{tasksDone}/{data.tasks.length}</span>
        </div>
        <div className="task-list">
          {data.tasks.map((task) => (
            <div key={task.id} className={task.done ? "task done" : "task"}>
              <button className="task-toggle" onClick={() => toggleTask(task.id)} aria-pressed={task.done}>
                <span className="check-circle">{task.done && <Icon name="check" size={16} />}</span>
                <span><strong>{task.label}</strong><small>{task.done ? "Terminé" : task.detail}</small></span>
              </button>
              <button className="icon-button" onClick={() => deleteTask(task.id, task.label)} aria-label={`Supprimer ${task.label}`}><Icon name="trash" size={16} /></button>
            </div>
          ))}
          <form className="new-task" onSubmit={addTask}>
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Nouveau défi, ex. 20 min de vélo" aria-label="Nouveau défi sportif" />
            <button type="submit" aria-label="Ajouter le défi" disabled={!newTask.trim()}><Icon name="plus" size={18} /></button>
          </form>
        </div>
      </section>
    </div>
  );
}

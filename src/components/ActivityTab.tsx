import { useState } from "react";
import Icon from "./Icon";
import { sessionCredit as credit, sessionTypes, WEEKLY_ACTIVITY_GOAL as WEEKLY_GOAL } from "../lib/activity";
import { todayKey, type AppData, type Session, type SessionType } from "../lib/storage";

type ActivityTabProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  flash: (message: string) => void;
};

const parse = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (key: string, days: number) => { const date = parse(key); date.setDate(date.getDate() + days); return todayKey(date); };

export default function ActivityTab({ data, update, flash }: ActivityTabProps) {
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
      <section className="page-heading">
        <span className="large-icon mint-icon"><Icon name="shoe" size={25} /></span>
        <p className="eyebrow">Bouger</p>
        <h2>Activité & défis</h2>
        <p>Notez vos séances : l'OMS recommande au moins 150 minutes d'activité modérée par semaine.</p>
      </section>

      <section className="weekly-card">
        <div>
          <span>Cette semaine</span>
          <strong>{weekTotal} min</strong>
          <small>{weekTotal >= WEEKLY_GOAL ? "Repère OMS atteint, bravo !" : `Encore ${WEEKLY_GOAL - weekTotal} min pour le repère OMS`} · intense = ×2</small>
        </div>
        <div className="week-bars">
          {week.map((day, index) => (
            <span key={day}>
              <i style={{ height: `${Math.max(4, (minutesOf(day) / weekMax) * 100)}%` }} className={`${day === today ? "today" : ""} ${minutesOf(day) ? "bar-ok" : ""}`} />
              <small>{["L", "M", "M", "J", "V", "S", "D"][index]}</small>
            </span>
          ))}
        </div>
      </section>
      <span className="goal-bar activity-goal"><span style={{ width: `${Math.min(100, (weekTotal / WEEKLY_GOAL) * 100)}%` }} /></span>

      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">Nouvelle séance</p><h2>J'ai bougé</h2></div></div>
        <form className="session-form" onSubmit={addSession}>
          <div className="session-types" role="radiogroup" aria-label="Type d'activité">
            {sessionTypes.map((item) => (
              <button type="button" role="radio" aria-checked={type === item.id} key={item.id} className={type === item.id ? "selected" : ""} onClick={() => setType(item.id)}>
                <Icon name={item.icon} size={18} /><small>{item.label}</small>
              </button>
            ))}
          </div>
          <div className="session-fields">
            <label><span>Durée</span><div><input type="number" inputMode="numeric" min="1" max="600" value={minutes} onChange={(e) => setMinutes(e.target.value)} /><small>min</small></div></label>
            <label><span>Jour</span><input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
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

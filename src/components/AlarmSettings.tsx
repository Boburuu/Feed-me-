import { useState } from "react";
import Icon from "./Icon";
import { ALARM_OPENS, ALL_DAYS, alarmDaysLabel, MAX_ALARMS, WEEK_DAYS, type Alarm } from "../lib/reminders";

type AlarmSettingsProps = {
  alarms: Alarm[];
  /** Demande l'autorisation d'afficher des notifications si besoin ; `false` si elle est refusée. */
  onSave: (alarms: Alarm[], turningOn: boolean) => Promise<boolean>;
};

const emptyAlarm = (): Alarm => ({ id: Date.now(), label: "Noter mon repas", time: "12:00", days: ALL_DAYS, enabled: true, open: "repas" });

/** Alarmes créées par la personne : nom, heure, jours et écran ouvert en touchant la notification. */
export default function AlarmSettings({ alarms, onSave }: AlarmSettingsProps) {
  const [draft, setDraft] = useState<Alarm | null>(null);

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const alarm = { ...draft, label: draft.label.trim() || "Noter mon repas", enabled: true };
    const next = alarms.some((item) => item.id === alarm.id) ? alarms.map((item) => (item.id === alarm.id ? alarm : item)) : [...alarms, alarm];
    if (await onSave(next, true)) setDraft(null);
  };

  const remove = (alarm: Alarm) => {
    if (window.confirm(`Supprimer l'alarme « ${alarm.label} » de ${alarm.time.replace(":", " h ")} ?`)) void onSave(alarms.filter((item) => item.id !== alarm.id), false);
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const days = draft.days.includes(day) ? draft.days.filter((entry) => entry !== day) : [...draft.days, day];
    if (days.length) setDraft({ ...draft, days });
  };

  return (
    <section className="alarms">
      <h3>Mes alarmes</h3>
      {alarms.length === 0 && !draft && <p className="theme-description">Aucune alarme pour l'instant. Par exemple : « Noter mon repas » tous les jours à 12 h.</p>}
      {alarms.length > 0 && (
        <div className="set-g">
          {alarms.map((alarm) => (
            <div className="alarm-row" key={alarm.id}>
              <button type="button" className="alarm-main" onClick={() => setDraft(alarm)} aria-label={`Modifier l'alarme ${alarm.label}`}>
                <strong className={alarm.enabled ? "" : "off"}>{alarm.time.replace(":", " h ")}</strong>
                <span className="m-t"><b>{alarm.label}</b><small>{alarmDaysLabel(alarm.days)}</small></span>
              </button>
              <span className="alarm-actions">
                <label className="alarm-switch">
                  <input type="checkbox" role="switch" checked={alarm.enabled} onChange={(event) => void onSave(alarms.map((item) => (item.id === alarm.id ? { ...item, enabled: event.target.checked } : item)), event.target.checked)} aria-label={`Activer l'alarme ${alarm.label}`} />
                  <i />
                </label>
                <button type="button" className="icon-button" onClick={() => remove(alarm)} aria-label={`Supprimer l'alarme ${alarm.label}`}><Icon name="trash" size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <form className="alarm-form" onSubmit={saveDraft}>
          <label><span>Nom</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} maxLength={40} placeholder="Noter mon repas" /></label>
          <label><span>Heure</span><input type="time" value={draft.time} required onChange={(event) => event.target.value && setDraft({ ...draft, time: event.target.value })} /></label>
          <div>
            <p className="plan-label">Jours</p>
            <div className="alarm-chips" role="group" aria-label="Jours de l'alarme">
              {WEEK_DAYS.map(({ day, short }) => (
                <button type="button" key={day} aria-pressed={draft.days.includes(day)} className={draft.days.includes(day) ? "selected" : ""} onClick={() => toggleDay(day)}>{short}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="plan-label">En touchant la notification</p>
            <div className="alarm-chips" role="radiogroup" aria-label="Écran à ouvrir">
              {ALARM_OPENS.map(({ id, label }) => (
                <button type="button" role="radio" key={id} aria-checked={draft.open === id} className={draft.open === id ? "selected" : ""} onClick={() => setDraft({ ...draft, open: id })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setDraft(null)}>Annuler</button>
            <button type="submit" className="submit-button"><Icon name="check" size={18} /> Enregistrer</button>
          </div>
        </form>
      ) : alarms.length < MAX_ALARMS && (
        <button type="button" className="add-button alarm-new" onClick={() => setDraft(emptyAlarm())}><Icon name="plus" size={17} /> Créer une alarme</button>
      )}
    </section>
  );
}

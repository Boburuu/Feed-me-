import { askReminderPermission, defaultReminders, remindersAvailable, WEEK_DAYS, type ReminderSettings as Settings } from "../lib/reminders";

type ReminderSettingsProps = {
  value: Settings | undefined;
  onChange: (next: Settings) => void;
  flash: (message: string) => void;
};

/** Rappels : pesée (jours et heure), bilan de la semaine, repas prévus. */
export default function ReminderSettings({ value, onChange, flash }: ReminderSettingsProps) {
  const settings = { ...defaultReminders, ...value };
  const available = remindersAvailable();

  /** Activer un rappel demande d'abord l'autorisation d'afficher des notifications. */
  const enable = async (next: Settings, turningOn: boolean) => {
    if (turningOn && !(await askReminderPermission())) {
      flash("Notifications refusées : autorise-les dans les réglages du téléphone (Applications › Feed Me).");
      return;
    }
    onChange(next);
  };

  if (!available) {
    return <p className="theme-description">Les rappels (pesée, bilan, repas prévus) fonctionnent dans l'appli Android. Dans le navigateur, ils ne peuvent pas être programmés.</p>;
  }

  return (
    <div className="reminders">
      <label className="planned-toggle">
        <input type="checkbox" checked={settings.weigh.enabled} onChange={(e) => void enable({ ...settings, weigh: { ...settings.weigh, enabled: e.target.checked } }, e.target.checked)} />
        <span>Rappel de pesée</span>
      </label>
      {settings.weigh.enabled && (
        <div className="reminder-detail">
          <div className="container-chips" role="group" aria-label="Jours de pesée">
            {WEEK_DAYS.map(({ day, short }) => {
              const on = settings.weigh.days.includes(day);
              return (
                <button type="button" key={day} aria-pressed={on} className={on ? "selected" : ""} onClick={() => {
                  const days = on ? settings.weigh.days.filter((entry) => entry !== day) : [...settings.weigh.days, day];
                  if (days.length) onChange({ ...settings, weigh: { ...settings.weigh, days } });
                }}>{short}</button>
              );
            })}
          </div>
          <label className="reminder-time">à <input type="time" value={settings.weigh.time} onChange={(e) => e.target.value && onChange({ ...settings, weigh: { ...settings.weigh, time: e.target.value } })} /></label>
        </div>
      )}

      <label className="planned-toggle">
        <input type="checkbox" checked={settings.weekly.enabled} onChange={(e) => void enable({ ...settings, weekly: { ...settings.weekly, enabled: e.target.checked } }, e.target.checked)} />
        <span>Bilan de la semaine prêt</span>
      </label>
      {settings.weekly.enabled && (
        <div className="container-chips reminder-detail" role="radiogroup" aria-label="Moment du bilan">
          {([["dimanche-soir", "dimanche 19 h"], ["lundi-matin", "lundi 9 h"]] as const).map(([when, label]) => (
            <button type="button" role="radio" aria-checked={settings.weekly.when === when} key={when} className={settings.weekly.when === when ? "selected" : ""} onClick={() => onChange({ ...settings, weekly: { ...settings.weekly, when } })}>{label}</button>
          ))}
        </div>
      )}

      <label className="planned-toggle">
        <input type="checkbox" checked={settings.planned.enabled} onChange={(e) => void enable({ ...settings, planned: { enabled: e.target.checked } }, e.target.checked)} />
        <span>Repas prévus : rappel à l'heure du repas pour le confirmer (petit-déjeuner 8 h, déjeuner 12 h 15, collation 16 h, dîner 19 h 30)</span>
      </label>
    </div>
  );
}

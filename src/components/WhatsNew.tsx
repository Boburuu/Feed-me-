import Icon from "./Icon";

type WhatsNewProps = {
  version: string;
  notes: string[];
  onClose: () => void;
};

/** Première ouverture après une mise à jour : ce qui a changé, en quelques lignes. */
export default function WhatsNew({ version, notes, onClose }: WhatsNewProps) {
  return (
    <div className="update-prompt" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="update-box">
        <span className="update-icon"><Icon name="check" size={40} /></span>
        <h2 id="whats-new-title">Mise à jour installée</h2>
        <p className="update-version">Feed Me {version}</p>
        <ul className="update-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
      </div>
      <div className="update-actions">
        <button type="button" className="submit-button" onClick={onClose}><Icon name="check" /> C'est noté</button>
      </div>
    </div>
  );
}

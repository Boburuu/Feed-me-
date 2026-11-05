import Icon from "./Icon";
import { UPDATE_URL } from "../lib/appUpdate";

type UpdatePromptProps = {
  version: string;
  onClose: () => void;
};

/** Nouvelle version publiée : plein écran à l'ouverture, jusqu'à ce qu'elle soit installée. */
export default function UpdatePrompt({ version, onClose }: UpdatePromptProps) {
  return (
    <div className="update-prompt" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-box">
        <span className="update-icon"><Icon name="download" size={40} /></span>
        <h2 id="update-title">Nouvelle version disponible</h2>
        <p className="update-version">Feed Me {version}</p>
        <p>Elle s'installe par-dessus celle que tu as déjà : tes repas, tes recettes et tes réglages restent.</p>
        <p className="update-warning">Chrome peut afficher « fichier potentiellement dangereux » : c'est normal pour une app installée hors du Play Store. Tu peux accepter pour ce fichier, téléchargé depuis ce bouton.</p>
      </div>
      <div className="update-actions">
        <a className="submit-button" href={UPDATE_URL} target="_blank" rel="noreferrer" onClick={onClose}><Icon name="download" /> Mettre à jour</a>
        <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

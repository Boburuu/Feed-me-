import Icon from "./Icon";
import { tipThemes, type Tip } from "../lib/tips";

type TipSplashProps = {
  tip: Tip;
  favorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  /** Ouvre le coin des conseils (favoris, conseils des jours passés, tous par thème). */
  onOpenCorner: () => void;
  /** Passe au conseil suivant. */
  onNext: () => void;
};

/** Conseil du jour, à la première ouverture de la journée : reste affiché jusqu'à ce qu'on le ferme. */
export default function TipSplash({ tip, favorite, onToggleFavorite, onClose, onOpenCorner, onNext }: TipSplashProps) {
  return (
    <div className="tip-splash" role="dialog" aria-modal="true" aria-label="Conseil du jour">
      <div className="tip-splash-card">
        <button type="button" className="icon-button tip-splash-close" onClick={onClose} aria-label="Fermer le conseil"><Icon name="close" size={16} /></button>
        <p className="eyebrow">Conseil du jour · {tipThemes[tip.theme]}</p>
        <p className="tip-splash-text">{tip.text}</p>
        <div className="tip-splash-actions">
          <button type="button" className={`tip-favorite${favorite ? " on" : ""}`} onClick={onToggleFavorite} aria-pressed={favorite}>
            {favorite ? "★ En favori" : "☆ Garder ce conseil"}
          </button>
          <button type="button" className="plan-confirm" onClick={onClose}><Icon name="check" size={14} /> Fermer</button>
        </div>
        <span className="tip-links">
          <button type="button" className="text-button" onClick={onNext}>Un autre conseil</button>
          <button type="button" className="text-button" onClick={onOpenCorner}>Tous mes conseils ›</button>
        </span>
      </div>
    </div>
  );
}

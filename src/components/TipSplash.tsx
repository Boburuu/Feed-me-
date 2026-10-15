import { useEffect, useState } from "react";
import Icon from "./Icon";
import { tipThemes, type Tip } from "../lib/tips";

type TipSplashProps = {
  tip: Tip;
  favorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
};

const DURATION_MS = 3000;

/** Conseil du jour à l'ouverture : 3 secondes, « Passer » pour fermer tout de suite. */
export default function TipSplash({ tip, favorite, onToggleFavorite, onClose }: TipSplashProps) {
  // Toucher le conseil (pour le lire ou le mettre en favori) arrête le compte à rebours.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onClose, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onClose]);

  return (
    <div className="tip-splash" role="dialog" aria-modal="true" aria-label="Conseil du jour" onClick={() => setPaused(true)}>
      <div className="tip-splash-card">
        <p className="eyebrow">Conseil du jour · {tipThemes[tip.theme]}</p>
        <p className="tip-splash-text">{tip.text}</p>
        <div className="tip-splash-actions">
          <button type="button" className={`tip-favorite${favorite ? " on" : ""}`} onClick={(event) => { event.stopPropagation(); setPaused(true); onToggleFavorite(); }} aria-pressed={favorite}>
            {favorite ? "★ En favori" : "☆ Garder ce conseil"}
          </button>
          <button type="button" className="plan-confirm" onClick={(event) => { event.stopPropagation(); onClose(); }}><Icon name="check" size={14} /> Passer</button>
        </div>
        {!paused && <span className="tip-splash-progress" style={{ animationDuration: `${DURATION_MS}ms` }} />}
      </div>
    </div>
  );
}

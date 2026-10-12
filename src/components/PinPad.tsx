import { useEffect, useState } from "react";
import Icon from "./Icon";
import { PIN_LENGTH } from "../lib/storage";

type PinPadProps = {
  title: string;
  subtitle: string;
  error?: string;
  disabled?: boolean;
  /** Nombre de chiffres attendus (4 par défaut, 6 pour un ancien code). */
  length?: number;
  onComplete: (pin: string) => void;
};

/** Pavé numérique, utilisable au doigt ou au clavier. */
export default function PinPad({ title, subtitle, error, disabled = false, length = PIN_LENGTH, onComplete }: PinPadProps) {
  const [pin, setPin] = useState("");

  // Une nouvelle erreur vide la saisie pour recommencer.
  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  const press = (digit: string) => {
    if (disabled || pin.length >= length) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === length) {
      window.setTimeout(() => {
        onComplete(next);
        setPin("");
      }, 120);
    }
  };

  const erase = () => setPin((value) => value.slice(0, -1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") erase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="pin-pad">
      <h2>{title}</h2>
      <p className="pin-subtitle">{subtitle}</p>
      <div className={`pin-dots ${error ? "shake" : ""}`} aria-label={`${pin.length} chiffres saisis sur ${length}`} role="status">
        {Array.from({ length }).map((_, index) => (
          <span key={index} className={index < pin.length ? "filled" : ""} />
        ))}
      </div>
      <p className="pin-error" role="alert">{error}</p>
      <div className="pin-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button type="button" key={digit} onClick={() => press(digit)} disabled={disabled}>{digit}</button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} disabled={disabled}>0</button>
        <button type="button" className="pin-erase" onClick={erase} aria-label="Effacer le dernier chiffre" disabled={disabled || !pin}>
          <Icon name="backspace" size={22} />
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import Icon from "./Icon";
import { checkPin, type PinRecord } from "../lib/storage";

type EraseConfirmProps = {
  /** Code demandé en plus (depuis les paramètres) ; absent depuis « Code oublié ? ». */
  pin?: PinRecord;
  onErase: () => void;
  onCancel: () => void;
};

const WORD = "EFFACER";

/** Effacer tout : on tape EFFACER (et son code s'il est connu). Les données restent 30 jours dans la corbeille. */
export default function EraseConfirm({ pin, onErase, onCancel }: EraseConfirmProps) {
  const [word, setWord] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const ready = word.trim().toUpperCase() === WORD && (!pin || code.length >= 4);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (pin && !(await checkPin(code, pin))) { setError("Code incorrect : rien n'a été effacé."); setCode(""); return; }
    onErase();
  };

  return (
    <form className="erase-box" onSubmit={submit}>
      <strong><Icon name="trash" size={18} /> Effacer toutes les données de Feed Me</strong>
      <p>Profil, repas, recettes, poids et réglages disparaissent de l'app. Ils restent récupérables pendant 30 jours : à la prochaine ouverture, Feed Me te proposera de les restaurer{pin ? "" : " avec ton ancien code"}.</p>
      <label><span>Tape {WORD} pour confirmer</span><input value={word} onChange={(event) => { setWord(event.target.value); setError(""); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={`Tape ${WORD} pour confirmer`} /></label>
      {pin && <label><span>Ton code</span><input value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setError(""); }} type="password" inputMode="numeric" maxLength={pin.length ?? 4} autoComplete="off" aria-label="Ton code" /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="erase-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="submit-button danger" disabled={!ready}>Effacer</button>
      </div>
    </form>
  );
}

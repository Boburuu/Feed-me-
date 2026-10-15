import { useState } from "react";
import Icon from "./Icon";
import { limits, todayKey, type WeightEntry } from "../lib/storage";
import { currentAverage, weighingTips } from "../lib/weight";

type QuickWeighProps = {
  weights: WeightEntry[];
  onSave: (date: string, kg: number) => void;
  onOpenTracking: () => void;
};

const kg = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

/** Pesée rapide : le dernier poids proposé, ±0,1 kg, enregistré pour aujourd'hui. */
export default function QuickWeigh({ weights, onSave, onOpenTracking }: QuickWeighProps) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const today = todayKey();
  const [value, setValue] = useState(last?.kg ?? 70);
  const [text, setText] = useState(String(last?.kg ?? "").replace(".", ","));
  const average = currentAverage(weights, today);
  const valid = value >= limits.weight.min && value <= limits.weight.max;

  const set = (next: number) => { const rounded = Math.round(next * 10) / 10; setValue(rounded); setText(String(rounded).replace(".", ",")); };

  return (
    <div className="quick-weigh">
      <div className="quick-weigh-value">
        <button type="button" className="round-button" onClick={() => set(value - 0.1)} aria-label="Moins 100 g"><Icon name="minus" /></button>
        <label>
          <input type="text" inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); const next = Number(e.target.value.replace(",", ".")); if (Number.isFinite(next)) setValue(next); }} aria-label="Poids en kg" />
          <span>kg</span>
        </label>
        <button type="button" className="round-button" onClick={() => set(value + 0.1)} aria-label="Plus 100 g"><Icon name="plus" /></button>
      </div>
      <p className="quick-weigh-context">
        {last ? `Dernière pesée : ${kg(last.kg)} le ${new Date(`${last.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "Première pesée"}
        {average !== null ? ` · moyenne 7 j : ${kg(average)}` : ""}
      </p>
      <small className="quick-weigh-tip">💡 {weighingTips[0]}</small>
      {!valid && <p className="form-error" role="alert">Le poids doit être compris entre {limits.weight.min} et {limits.weight.max} kg.</p>}
      <button type="button" className="submit-button" disabled={!valid} onClick={() => onSave(today, Math.round(value * 10) / 10)}>
        <Icon name="check" /> Enregistrer {kg(value)} aujourd'hui
      </button>
      <button type="button" className="text-button" onClick={onOpenTracking}>Voir mon suivi du poids</button>
    </div>
  );
}

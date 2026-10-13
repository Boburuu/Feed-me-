import Icon from "./Icon";
import type { FoodResult } from "../lib/foods";

/** Calories d'une portion quand on la connaît (« 109 kcal » pour 1 banane), sinon pour 100 g. */
export const kcalLabel = (result: FoodResult) => {
  if (result.perPortionOnly) return `${Math.round(result.kcal100)} kcal`;
  if (result.portionGrams) return `${Math.round((result.kcal100 * result.portionGrams) / 100)} kcal`;
  return `${Math.round(result.kcal100)} kcal/100 g`;
};

/** « 1 banane ≈ 120 g · 91 kcal/100 g · Ciqual (ANSES) » */
export const resultDetail = (result: FoodResult) => {
  const parts: string[] = [];
  if (result.perPortionOnly) parts.push("par portion");
  else if (result.portionLabel && result.portionGrams) parts.push(`${result.portionLabel} ≈ ${Math.round(result.portionGrams)} ${result.liquid ? "ml" : "g"}`, `${Math.round(result.kcal100)} kcal/100 ${result.liquid ? "ml" : "g"}`);
  parts.push(result.detail);
  return parts.join(" · ");
};

export const sourceIcon = { ciqual: "apple", off: "target", recette: "book", perso: "user" } as const;

type FoodResultRowProps = {
  result: FoodResult;
  onPick: (result: FoodResult) => void;
  /** Remplace l'icône de la source (probabilité d'un plat reconnu sur photo). */
  badge?: string;
};

/** Un aliment trouvé : nom, portion et source, calories à droite. */
export default function FoodResultRow({ result, onPick, badge }: FoodResultRowProps) {
  return (
    <button type="button" className="food-result" onClick={() => onPick(result)}>
      {badge
        ? <span className="photo-score">{badge}</span>
        : <span className={`food-icon source-${result.source}`}><Icon name={sourceIcon[result.source]} size={16} /></span>}
      <span className="food-result-text">
        <strong>{result.name}</strong>
        <small>{resultDetail(result)}</small>
      </span>
      <em>{kcalLabel(result)}</em>
    </button>
  );
}

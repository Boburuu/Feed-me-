import { useState } from "react";
import Icon from "./Icon";
import type { FoodResult } from "../lib/foods";
import { correctionKey } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";

/** Calories d'une portion quand on la connaît (« 109 kcal » pour 1 banane), sinon pour 100 g. */
export const kcalLabel = (result: FoodResult) => {
  if (result.perPortionOnly) return `${Math.round(result.kcal100)} kcal`;
  if (result.portionGrams) return `${Math.round((result.kcal100 * result.portionGrams) / 100)} kcal`;
  return `${Math.round(result.kcal100)} kcal/100 ${result.liquid ? "ml" : "g"}`;
};

/** « 1 banane ≈ 120 g · 91 kcal/100 g · Ciqual (ANSES) » */
export const resultDetail = (result: FoodResult) => {
  const parts: string[] = [];
  if (result.recipePortions) parts.push("1 part");
  else if (result.perPortionOnly) parts.push("par portion");
  // « 1 boîte » (paquet entier, nom interne) s'affiche « 1 paquet » : c'est souvent un sachet.
  else if (result.portionLabel && result.portionGrams) parts.push(`${result.portionLabel === "1 boîte" ? "1 paquet" : result.portionLabel} ≈ ${Math.round(result.portionGrams)} ${result.liquid ? "ml" : "g"}`, `${Math.round(result.kcal100)} kcal/100 ${result.liquid ? "ml" : "g"}`);
  parts.push(result.detail);
  return parts.join(" · ");
};

export const sourceIcon = { ciqual: "apple", off: "target", recette: "book", perso: "user", enseigne: "flame" } as const;

type FoodResultRowProps = {
  result: FoodResult;
  onPick: (result: FoodResult) => void;
  /** Remplace l'icône de la source (probabilité d'un plat reconnu sur photo). */
  badge?: string;
  /** Déjà coché dans le repas (étape « je coche ») : une coche remplace la photo. */
  selected?: boolean;
};

/** Photo du produit (Open Food Facts) ; l'icône de la source si elle manque ou ne charge pas. */
function ResultPicture({ result }: { result: FoodResult }) {
  const [failed, setFailed] = useState(false);
  // Photo de la fiche, sinon celle que tu as ajoutée toi-même.
  const corrections = useCorrections();
  const image = result.image ?? corrections?.images[correctionKey(result)];
  if (image && !failed) {
    return <img className="food-photo" src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <span className={`food-icon source-${result.source}`}><Icon name={sourceIcon[result.source]} size={16} /></span>;
}

/** Un aliment trouvé : photo, nom, portion et source, calories à droite ; ses autres versions sur demande. */
export default function FoodResultRow({ result, onPick, badge, selected }: FoodResultRowProps) {
  const [open, setOpen] = useState(false);
  const row = (item: FoodResult, version = false) => (
    <button type="button" className={`food-result${version ? " food-version" : ""}${selected && !version ? " picked" : ""}`} onClick={() => onPick(item)} key={item.ref ?? item.name} aria-pressed={selected === undefined || version ? undefined : selected}>
      {selected && !version ? <span className="pick-check" aria-hidden="true">✓</span> : badge && !version ? <span className="photo-score">{badge}</span> : <ResultPicture result={item} />}
      <span className="food-result-text">
        <strong>{version ? item.versionLabel ?? item.name : item.name}</strong>
        <small>{version ? `${item.name} · ${resultDetail(item)}` : resultDetail(item)}</small>
      </span>
      <em>{kcalLabel(item)}</em>
    </button>
  );
  if (!result.versions?.length) return row(result);
  return (
    <div className="food-result-group">
      {row(result)}
      <button type="button" className="text-button food-versions-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Masquer les autres versions" : `${result.versions.length} autre${result.versions.length > 1 ? "s" : ""} version${result.versions.length > 1 ? "s" : ""} (pays, format)`}
        {result.versionLabel ? ` · celle-ci : ${result.versionLabel}` : ""}
      </button>
      {open && result.versions.map((version) => row(version, true))}
    </div>
  );
}

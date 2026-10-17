import { useState } from "react";
import { lastTips, tips, tipThemes, type Tip, type TipTheme } from "../lib/tips";

type TipsCornerProps = {
  /** Numéro du conseil affiché en ce moment. */
  count: number;
  favorites: number[];
  onToggleFavorite: (id: number) => void;
};

type Filter = "recent" | "favorites" | TipTheme;

/** Coin des conseils : les derniers vus, les favoris, et tous les conseils par thème. */
export default function TipsCorner({ count, favorites, onToggleFavorite }: TipsCornerProps) {
  const [filter, setFilter] = useState<Filter>("recent");
  const rows: { tip: Tip; note?: string }[] = filter === "recent"
    ? lastTips(count).map((tip, index) => ({ tip, note: index === 0 ? `En ce moment · ${tipThemes[tip.theme]}` : tipThemes[tip.theme] }))
    : filter === "favorites"
      ? tips.filter((tip) => favorites.includes(tip.id)).map((tip) => ({ tip, note: tipThemes[tip.theme] }))
      : tips.filter((tip) => tip.theme === filter).map((tip) => ({ tip }));
  const chips: [Filter, string][] = [["recent", "Derniers vus"], ["favorites", `Favoris (${favorites.length})`], ...(Object.entries(tipThemes) as [TipTheme, string][])];

  return (
    <div className="tips-corner">
      <div className="container-chips" role="radiogroup" aria-label="Quels conseils">
        {chips.map(([id, label]) => (
          <button type="button" role="radio" aria-checked={filter === id} key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {rows.length ? (
        <ul className="favorite-tips">
          {rows.map(({ tip, note }) => {
            const favorite = favorites.includes(tip.id);
            return (
              <li key={tip.id}>
                <span>{note && <small>{note}</small>}{tip.text}</span>
                <button type="button" className={`tip-star${favorite ? " on" : ""}`} onClick={() => onToggleFavorite(tip.id)} aria-pressed={favorite} aria-label={favorite ? "Retirer des favoris" : "Garder ce conseil en favori"}>{favorite ? "★" : "☆"}</button>
              </li>
            );
          })}
        </ul>
      ) : <p className="theme-description">Touche ☆ sur un conseil pour le retrouver ici.</p>}
    </div>
  );
}

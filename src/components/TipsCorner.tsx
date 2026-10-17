import { useState } from "react";
import { recentTips, tips, tipThemes, type Tip, type TipTheme } from "../lib/tips";

type TipsCornerProps = {
  today: string;
  favorites: number[];
  onToggleFavorite: (id: number) => void;
};

type Filter = "recent" | "favorites" | TipTheme;

const dayLabel = (date: string, today: string) =>
  date === today ? "Aujourd'hui" : new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Coin des conseils : ceux des derniers jours, les favoris, et tous les conseils par thème. */
export default function TipsCorner({ today, favorites, onToggleFavorite }: TipsCornerProps) {
  const [filter, setFilter] = useState<Filter>("recent");
  const rows: { tip: Tip; note?: string }[] = filter === "recent"
    ? recentTips(today).map(({ tip, date }) => ({ tip, note: dayLabel(date, today) }))
    : filter === "favorites"
      ? tips.filter((tip) => favorites.includes(tip.id)).map((tip) => ({ tip, note: tipThemes[tip.theme] }))
      : tips.filter((tip) => tip.theme === filter).map((tip) => ({ tip }));
  const chips: [Filter, string][] = [["recent", "Derniers jours"], ["favorites", `Favoris (${favorites.length})`], ...(Object.entries(tipThemes) as [TipTheme, string][])];

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

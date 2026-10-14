import { useMemo, useState } from "react";
import FoodResultRow from "./FoodResultRow";
import Icon from "./Icon";
import { brands, categoriesOf, fastFoodItems, fastFoodResult, menuSteps, menuTotal, searchFastFood, type BrandId, type FastFoodItem, type MenuChoice } from "../lib/fastFood";
import type { FoodResult } from "../lib/foods";

type FastFoodPanelProps = {
  /** Produits choisis (un seul, ou les éléments d'un menu), ajoutés comme aliments séparés. */
  onAdd: (foods: FoodResult[]) => void;
  onClose: () => void;
  /** Enseigne sans carte embarquée : chercher dans Open Food Facts, ou créer le produit. */
  onSearch: (text: string) => void;
  onCreate: (name: string) => void;
};

const LIMIT = 30;
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Fast-foods : carte officielle d'une enseigne, à la carte ou en menu (plat, accompagnement, boisson, sauce). */
export default function FastFoodPanel({ onAdd, onClose, onSearch, onCreate }: FastFoodPanelProps) {
  const [brandId, setBrandId] = useState<BrandId>("bk");
  const [mode, setMode] = useState<"carte" | "menu">("carte");
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<MenuChoice>({});
  const [step, setStep] = useState(0);
  const brand = brands.find((entry) => entry.id === brandId)!;
  const menuStep = menuSteps[step];

  const list = useMemo(() => {
    const allowed: readonly string[] | null = mode === "menu" && menuStep ? menuStep.categories : null;
    const base = filter.trim() ? searchFastFood(filter, brandId) : fastFoodItems.filter((item) => item.brand === brandId);
    return base.filter((item) => (!category || item.category === category) && (!allowed || allowed.includes(item.category)));
  }, [brandId, category, filter, mode, menuStep]);

  const categories = mode === "menu" && menuStep ? categoriesOf(brandId).filter((entry) => (menuStep.categories as readonly string[]).includes(entry)) : categoriesOf(brandId);
  const total = menuTotal(menu);

  const pickBrand = (id: BrandId) => { setBrandId(id); setCategory(null); setFilter(""); setMenu({}); setStep(0); };
  const pickMode = (next: "carte" | "menu") => { setMode(next); setCategory(null); setFilter(""); setMenu({}); setStep(0); };
  const choose = (item: FastFoodItem | undefined) => {
    setMenu((current) => ({ ...current, [menuStep.key]: item }));
    setCategory(null);
    setFilter("");
    setStep((value) => value + 1);
  };
  const pick = (item: FastFoodItem) => (mode === "menu" ? choose(item) : onAdd([fastFoodResult(item)]));

  return (
    <section className="barcode-panel fastfood-panel">
      <div className="barcode-head">
        <strong>Fast-food</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={15} /></button>
      </div>

      <div className="container-chips" role="radiogroup" aria-label="Enseigne">
        {brands.map((entry) => (
          <button type="button" role="radio" aria-checked={entry.id === brandId} key={entry.id} className={entry.id === brandId ? "selected" : ""} onClick={() => pickBrand(entry.id)}>{entry.name}</button>
        ))}
      </div>

      {brand.missing && (
        <>
          <p className="food-hint">{brand.missing}</p>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={() => onCreate(`${brand.name} · `)}><Icon name="plus" size={16} /> Créer un produit {brand.name}</button>
            <button type="button" className="add-part" onClick={() => onSearch(brand.name)}><Icon name="target" size={16} /> Chercher « {brand.name} » dans Open Food Facts</button>
          </div>
          <small className="barcode-hint">Open Food Facts contient surtout des produits de supermarché : un plat de restaurant y est rare et ses valeurs sont communautaires.</small>
        </>
      )}

      {brand.offQuery && (
        <>
          <p className="food-hint">Marie fait des plats cuisinés vendus en supermarché : ils sont dans Open Food Facts avec les valeurs de leur emballage. Le code-barres du paquet reste le plus sûr.</p>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={() => onSearch(`${brand.offQuery} `)}><Icon name="target" size={16} /> Chercher les plats Marie</button>
          </div>
        </>
      )}

      {brand.catalogue && (
        <>
          <div className="unit-toggle" role="radiogroup" aria-label="À la carte ou en menu">
            <button type="button" role="radio" aria-checked={mode === "carte"} className={mode === "carte" ? "selected" : ""} onClick={() => pickMode("carte")}>À la carte</button>
            <button type="button" role="radio" aria-checked={mode === "menu"} className={mode === "menu" ? "selected" : ""} onClick={() => pickMode("menu")}>Composer un menu</button>
          </div>

          {mode === "menu" && (
            <div className="menu-recap">
              {menuSteps.map((entry, index) => (
                <button type="button" key={entry.key} className={`menu-recap-line${index === step ? " current" : ""}`} onClick={() => { setStep(index); setCategory(null); setFilter(""); }}>
                  <span>{entry.label}</span>
                  <strong>{menu[entry.key] ? menu[entry.key]!.name : index < step ? "sans" : "—"}</strong>
                  <small>{menu[entry.key] ? `${menu[entry.key]!.kcal} kcal` : ""}</small>
                </button>
              ))}
              <div className="menu-recap-total">
                <span>Menu complet<small>{Math.round(total.carbs)} g de glucides · {Math.round(total.protein)} g de protéines · {Math.round(total.fat)} g de lipides</small></span>
                <strong>{total.kcal} kcal</strong>
              </div>
            </div>
          )}

          {(mode === "carte" || menuStep) && (
            <>
              {mode === "menu" && <p className="food-section">{menuStep.label} : choisis{step > 0 ? " (ou passe)" : ""}</p>}
              <input className="fastfood-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Chercher chez ${brand.name}…`} aria-label={`Chercher un produit ${brand.name}`} />
              {categories.length > 1 && (
                <div className="container-chips" role="radiogroup" aria-label="Catégorie">
                  <button type="button" role="radio" aria-checked={!category} className={!category ? "selected" : ""} onClick={() => setCategory(null)}>Tout</button>
                  {categories.map((entry) => (
                    <button type="button" role="radio" aria-checked={category === entry} key={entry} className={category === entry ? "selected" : ""} onClick={() => setCategory(entry)}>{entry}</button>
                  ))}
                </div>
              )}
              <div className="fastfood-list">
                {list.slice(0, LIMIT).map((item) => <FoodResultRow key={item.name} result={fastFoodResult(item)} onPick={() => pick(item)} />)}
                {!list.length && <p className="food-hint">Aucun produit trouvé.</p>}
                {list.length > LIMIT && <small className="barcode-hint">{list.length - LIMIT} autres : précise ta recherche.</small>}
              </div>
              {mode === "menu" && step > 0 && (
                <button type="button" className="text-button" onClick={() => choose(undefined)}>Passer : pas de {menuStep.label.replace(/^(Le |La |L')/, "").toLowerCase()}</button>
              )}
            </>
          )}

          {mode === "menu" && total.items.length > 0 && (
            <div className="barcode-actions">
              <button type="button" className="text-button" onClick={() => { setMenu({}); setStep(0); }}>Recommencer</button>
              <button type="button" className="plan-confirm" onClick={() => onAdd(total.items.map(fastFoodResult))}>
                <Icon name="check" size={14} /> Ajouter le menu ({total.items.length})
              </button>
            </div>
          )}

          <small className="barcode-hint">
            Valeurs officielles {brand.catalogue.source}, relevées le {dateLabel(brand.catalogue.date)} sur <a href={brand.catalogue.url} target="_blank" rel="noreferrer">burgerking.fr</a>. Indicatives : une recette peut varier d'un restaurant à l'autre. Les produits publiés avec des valeurs contradictoires ont été écartés.
          </small>
        </>
      )}
    </section>
  );
}

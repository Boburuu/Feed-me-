import { useState } from "react";
import Icon from "./Icon";
import LabelCheck from "./LabelCheck";
import { canCheckLabel, reliabilityOf } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";
import { coherenceWarnings, quantityWarning } from "../lib/coherence";
import { couldHydrate, drinkMl } from "../lib/hydration";
import { itemCalories, itemCarbs, itemFat, itemGrams, nutrientGrams } from "../lib/foods";
import type { MealItem } from "../lib/storage";

type MealLineEditorProps = {
  line: MealItem;
  onChange: (change: Partial<MealItem>) => void;
  onRemove: () => void;
  /** Ingrédient de recette : l'hydratation se règle avec le volume final de la recette. */
  hideHydration?: boolean;
};

const sourceName = { ciqual: "Ciqual", off: "Open Food Facts", recette: "Ma recette", perso: "Mon aliment" } as const;
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
/** « 1 banane » → « banane », « 1 portion (200 ml) » → « portion ». */
const unitName = (label?: string) => (label ?? "portion").replace(/^1\s+/, "").replace(/\s*\(.*$/, "").slice(0, 16);
/** « 330 ml », « 1500 ml » → « 1,5 L ». */
const volume = (ml: number) => (ml >= 1000 ? `${n(ml / 1000)} L` : `${n(Math.round(ml))} ml`);
const amount = (grams: number, liquid?: boolean) => (liquid ? volume(grams) : `${n(Math.round(grams))} g`);

/** Contenants proposés pour une boisson (1 ml ≈ 1 g). */
const containers = [
  { label: "tasse", ml: 150 },
  { label: "verre", ml: 200 },
  { label: "mug", ml: 250 },
  { label: "grand verre", ml: 300 },
  { label: "canette", ml: 330 },
  { label: "bol", ml: 350 },
  { label: "bouteille", ml: 500 },
  { label: "grande bouteille", ml: 1500 },
];
/** Parts d'une boîte ou d'un paquet : on n'utilise pas toujours tout. */
const fractions = [
  { label: "1/10", value: 0.1 },
  { label: "1/8", value: 0.125 },
  { label: "1/6", value: 1 / 6 },
  { label: "1/4", value: 0.25 },
  { label: "1/3", value: 1 / 3 },
  { label: "1/2", value: 0.5 },
  { label: "3/4", value: 0.75 },
  { label: "entière", value: 1 },
];
const PACKAGE_LABEL = "1 boîte";

/** Une ligne d'aliment : quantité et unité (portion, boîte, contenant, grammes ou ml). */
export default function MealLineEditor({ line, onChange, onRemove, hideHydration }: MealLineEditorProps) {
  const grams = itemGrams(line);
  const corrections = useCorrections();
  const [checking, setChecking] = useState(false);
  const reliability = reliabilityOf(line);
  const perPortionOnly = line.unit === "portion" && !line.portionGrams;
  const isPackage = line.unit === "portion" && line.portionLabel === PACKAGE_LABEL && !!line.packageGrams;
  const isPiece = line.unit === "portion" && !!line.pieceGrams && line.portionGrams === line.pieceGrams && line.portionLabel === line.pieceLabel;
  // La pièce n'est un choix à part que si elle diffère de la portion (« 1 portion (80 g) » ≠ « 1 tranche »).
  const hasPiece = !!line.pieceGrams && line.pieceGrams !== line.servingGrams;
  const massUnit = line.liquid ? "ml" : "g";
  /** Recette du carnet : on choisit le nombre de parts mangées sur le plat entier. */
  const servings = line.source === "recette" ? line.recipePortions : undefined;
  const plural = (count: number) => (count > 1 ? "s" : "");

  /** Changer d'unité en gardant la même quantité mangée. */
  const useUnit = (unit: "g" | { label: string; grams: number }) => {
    const total = grams ?? line.quantity;
    if (unit === "g") onChange({ unit: "g", quantity: Math.round(total) });
    else onChange({ unit: "portion", portionGrams: unit.grams, portionLabel: unit.label, quantity: Math.max(0.1, Math.round((total / unit.grams) * 4) / 4) });
  };
  const step = (direction: 1 | -1) => {
    // Les pièces se comptent une à une (« 10 tranches ») ; en dessous de 1, par moitié.
    const size = line.unit === "g" ? (line.liquid ? 50 : 10) : isPackage || servings ? (servings && line.quantity >= 1 ? 0.5 : 0.25) : line.liquid || (direction > 0 ? line.quantity >= 1 : line.quantity > 1) ? 1 : 0.5;
    onChange({ quantity: Math.max(size, Math.round((line.quantity + direction * size) * 100) / 100) });
  };

  // Unités proposées pour un aliment solide : sa portion habituelle, la boîte, les grammes.
  const options: { key: string; label: string; selected: boolean; pick: () => void }[] = [];
  if (!perPortionOnly && !line.liquid) {
    if (hasPiece) {
      options.push({ key: "piece", label: unitName(line.pieceLabel), selected: isPiece, pick: () => useUnit({ label: line.pieceLabel ?? "1 pièce", grams: line.pieceGrams! }) });
    }
    if (line.servingGrams) {
      options.push({
        key: "serving",
        label: unitName(line.servingLabel) === "portion" ? `portion ${amount(line.servingGrams)}` : unitName(line.servingLabel),
        selected: line.unit === "portion" && !isPackage && !(hasPiece && isPiece),
        pick: () => useUnit({ label: line.servingLabel ?? "1 portion", grams: line.servingGrams! }),
      });
    }
    if (line.packageGrams) {
      options.push({ key: "package", label: `boîte ${amount(line.packageGrams)}`, selected: isPackage, pick: () => useUnit({ label: PACKAGE_LABEL, grams: line.packageGrams! }) });
    }
    options.push({ key: "g", label: "g", selected: line.unit === "g", pick: () => useUnit("g") });
  }

  return (
    <div className="meal-line">
      <div className="meal-line-top">
        <strong>{line.name}</strong>
        <span className="meal-line-kcal"><b>{Math.round(itemCalories(line))}</b> kcal</span>
        <button type="button" className="icon-button" onClick={onRemove} aria-label={`Retirer ${line.name}`}><Icon name="close" size={15} /></button>
      </div>

      <div className="meal-line-amount">
        <div className="stepper">
          <button type="button" onClick={() => step(-1)} aria-label="Moins"><Icon name="minus" size={15} /></button>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={Math.round(line.quantity * 100) / 100}
            onChange={(e) => onChange({ quantity: Math.max(0, Number(e.target.value)) })}
            aria-label={`Quantité de ${line.name}`}
          />
          <button type="button" onClick={() => step(1)} aria-label="Plus"><Icon name="plus" size={15} /></button>
        </div>
        {(line.liquid || perPortionOnly || options.length < 2) && (
          <span className="unit-fixed">
            {line.unit === "g" ? massUnit : servings ? `part${plural(line.quantity)} sur ${servings}` : `${unitName(line.portionLabel)}${line.quantity > 1 && line.liquid ? "s" : ""}`}
          </span>
        )}
        {line.unit === "portion" && grams ? <span className="drink-total">= {amount(grams, line.liquid)}</span> : null}
      </div>

      {options.length >= 2 && (
        <div className="container-chips" role="radiogroup" aria-label="Unité">
          {options.map((option) => (
            <button type="button" role="radio" aria-checked={option.selected} key={option.key} className={option.selected ? "selected" : ""} onClick={option.pick}>{option.label}</button>
          ))}
        </div>
      )}

      {/* Recette pour plusieurs : parts mangées, jusqu'au plat entier. */}
      {servings && (
        <div className="container-chips fraction-chips" role="radiogroup" aria-label="Parts mangées">
          {[...[0.5, 1, 2, 3].filter((value) => value < servings), servings].map((value) => {
            const selected = Math.abs(line.quantity - value) < 0.01;
            return (
              <button type="button" role="radio" aria-checked={selected} key={value} className={selected ? "selected" : ""} onClick={() => onChange({ quantity: value })}>
                {value === servings && servings > 1 ? `tout (${servings})` : value === 0.5 ? "½ part" : `${value} part${plural(value)}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Boîte entamée : la part utilisée dans le plat. */}
      {isPackage && (
        <div className="container-chips fraction-chips" role="radiogroup" aria-label="Part de la boîte">
          {fractions.map((fraction) => {
            const selected = Math.abs(line.quantity - fraction.value) < 0.01;
            return (
              <button type="button" role="radio" aria-checked={selected} key={fraction.label} className={selected ? "selected" : ""} onClick={() => onChange({ quantity: fraction.value })}>
                {fraction.label}
              </button>
            );
          })}
        </div>
      )}

      {line.liquid && (
        <div className="container-chips" role="radiogroup" aria-label="Contenant">
          {[...(line.packageGrams ? [{ label: "emballage", ml: line.packageGrams }] : []), ...containers].map((container) => {
            const selected = line.unit === "portion" && line.portionGrams === container.ml && unitName(line.portionLabel) === container.label;
            return (
              <button type="button" role="radio" aria-checked={selected} key={container.label} className={selected ? "selected" : ""} onClick={() => useUnit({ label: `1 ${container.label}`, grams: container.ml })}>
                {container.label} <small>{volume(container.ml)}</small>
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={line.unit === "g"} className={line.unit === "g" ? "selected" : ""} onClick={() => useUnit("g")}>en ml</button>
        </div>
      )}

      {/* Riz, pâtes… vendus secs : pesés secs (avant cuisson) ou cuits (dans l'assiette). */}
      {line.cookedFactor && line.unit === "g" && (
        <>
          <div className="container-chips" role="radiogroup" aria-label="Pesé">
            <small className="chips-label">Pesé :</small>
            <button type="button" role="radio" aria-checked={!line.weighedCooked} className={!line.weighedCooked ? "selected" : ""} onClick={() => onChange({ weighedCooked: false })}>sec, avant cuisson</button>
            <button type="button" role="radio" aria-checked={!!line.weighedCooked} className={line.weighedCooked ? "selected" : ""} onClick={() => onChange({ weighedCooked: true })}>cuit</button>
          </div>
          {line.weighedCooked && <small className="meal-line-detail">{n(Math.round(line.quantity))} g cuits ≈ {n(Math.round(nutrientGrams(line)))} g secs (la fiche est celle du produit sec)</small>}
        </>
      )}
      {(itemCarbs(line) !== null || itemFat(line) !== null) && (
        <small className="meal-line-carbs">
          {[itemCarbs(line) !== null ? `${n(Math.round(itemCarbs(line)! * 10) / 10)} g de glucides` : "", itemFat(line) !== null ? `${n(Math.round(itemFat(line)! * 10) / 10)} g de lipides` : ""].filter(Boolean).join(" · ")}
        </small>
      )}
      {/* Hydratation : boissons comptées d'office ; soupe, lait… au choix. */}
      {!hideHydration && (line.liquid || line.drinkMlPerPart || couldHydrate(line)) && (
        <button type="button" className={`hydrate-toggle${drinkMl(line) > 0 ? " on" : ""}`} aria-pressed={drinkMl(line) > 0}
          onClick={() => onChange({ hydrates: drinkMl(line) > 0 ? false : true })}>
          {drinkMl(line) > 0 ? `💧 ${volume(drinkMl(line))} dans l'hydratation` : "💧 Compter dans l'hydratation"}
        </button>
      )}
      {[quantityWarning(line)].filter(Boolean).map((warning) => <small className="meal-line-warning" key={warning}>⚠ {warning}</small>)}
      {coherenceWarnings(line).map((warning) => <small className="meal-line-warning" key={warning}>⚠ {warning}</small>)}
      <div className="meal-line-source">
        <span className={`reliability ${reliability.tone}`}>{reliability.label}</span>
        {corrections && canCheckLabel(line) && !checking && (
          <button type="button" className="text-button" onClick={() => setChecking(true)}>Vérifier avec l'étiquette</button>
        )}
      </div>
      {checking && <LabelCheck line={line} onChange={onChange} onClose={() => setChecking(false)} />}
      <small className="meal-line-detail">
        {servings ? `Ma recette pour ${servings} pers. · ${Math.round(line.kcal100)} kcal la part` : `Base : ${n(Math.round(line.kcal100))} kcal ${perPortionOnly ? "par portion" : `pour 100 ${line.liquid ? "ml" : "g"}`} · ${line.matchedName ? `${line.matchedName} (${sourceName[line.source]})` : sourceName[line.source]}`}
      </small>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import LabelCheck from "./LabelCheck";
import { canCheckLabel, correctionKey, reliabilityOf } from "../lib/corrections";
import { shrinkImage } from "../lib/images";
import { toPantry } from "../lib/pantry";
import { cookingBase, cookingVariants, cookKey, withVariant, type CookingVariant } from "../lib/cooking";
import { useCorrections } from "../lib/correctionsContext";
import { coherenceWarnings, quantityWarning } from "../lib/coherence";
import { couldHydrate, drinkMl, isPreparedDrink } from "../lib/hydration";
import { isReadyDrink, needsPortionWeight, normalize, withPortionWeight, itemCalories, itemCarbs, itemExtra, itemFat, itemGrams, nutrientGrams } from "../lib/foods";
import type { MealItem } from "../lib/storage";

type MealLineEditorProps = {
  line: MealItem;
  onChange: (change: Partial<MealItem>) => void;
  onRemove: () => void;
  /** Ingrédient de recette : l'hydratation se règle avec le volume final de la recette. */
  hideHydration?: boolean;
  /** Recette dans un repas : ouvrir ses ingrédients pour les changer ce jour-là seulement. */
  onAdapt?: () => void;
};

const sourceName = { ciqual: "Ciqual", off: "Open Food Facts", recette: "Ma recette", perso: "Mon aliment", enseigne: "carte officielle" } as const;
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
/** Cuillères (repères courants : 5 ml et 15 ml ; en grammes, ça dépend de l'aliment). */
const spoons = [{ label: "c. à café", ml: 5 }, { label: "c. à soupe", ml: 15 }];
/** Aliments qu'on dose souvent à la cuillère (sucre, huile, cacao, épices…). */
const spoonFood = /\b(sucre|sel|farine|huile|beurre|creme|miel|confiture|sauce|moutarde|ketchup|mayonnaise|epices?|cannelle|cacao|chocolat en poudre|poudre|levure|vinaigre|graines?|lait en poudre|whey|proteines?|ail|herbes|poivre|curry|paprika|cumin|cafe|the|sirop|pate a tartiner|nutella|cacahuete|goody|ricore|nesquik|maizena|fecule|parmesan|pesto|tahini|houmous|beurre de|compote|yaourt|fromage blanc|skyr|flocons|avoine|muesli|granola)\b/;
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
type VolumeUnit = NonNullable<MealItem["volumeUnit"]>;
const volumeUnits: { id: VolumeUnit; ml: number }[] = [{ id: "ml", ml: 1 }, { id: "cl", ml: 10 }, { id: "dl", ml: 100 }, { id: "L", ml: 1000 }];

/** Une ligne d'aliment : quantité et unité (portion, boîte, contenant, grammes ou ml). */
export default function MealLineEditor({ line, onChange, onRemove, hideHydration, onAdapt }: MealLineEditorProps) {
  const grams = itemGrams(line);
  const corrections = useCorrections();
  /** Boisson comptée en volume : l'unité affichée (la quantité reste en ml). */
  const inVolume = !!line.liquid && line.unit === "g";
  const volumeUnit: VolumeUnit = inVolume ? line.volumeUnit ?? "ml" : "ml";
  const volumeFactor = volumeUnits.find((unit) => unit.id === volumeUnit)!.ml;
  /** Fiche Ciqual : valeurs pour 100 g, même pour une boisson. */
  const per100g = line.source === "ciqual";
  const [checking, setChecking] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const ownImage = corrections?.images[correctionKey(line)];
  const [details, setDetails] = useState(false);
  const reliability = reliabilityOf(line);
  /** Sucres, saturés, fibres, sel : affichés quand la fiche les donne. */
  const extras = ([["sugars100", "sucres"], ["satFat100", "saturés"], ["fiber100", "fibres"], ["salt100", "sel"]] as const).flatMap(([key, label]) => {
    const value = itemExtra(line, key);
    return value === null ? [] : [`${n(Math.round(value * 10) / 10)} g ${label === "sel" ? "de sel" : label === "fibres" ? "de fibres" : label === "sucres" ? "de sucres" : "d'AG saturés"}`];
  });
  // Fiches crue et cuites du même aliment (Ciqual), chargées avec la table.
  const [variants, setVariants] = useState<CookingVariant[]>([]);
  const variantKey = line.source === "ciqual" ? cookingBase(line.name) : "";
  useEffect(() => {
    let alive = true;
    if (!variantKey) { setVariants([]); return; }
    cookingVariants(line).then((list) => { if (alive) setVariants(list); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey]);
  /** Le choix est retenu pour la prochaine fois que cet aliment est ajouté. */
  const pickVariant = (variant: CookingVariant) => {
    onChange(withVariant(line, variant));
    corrections?.saveCookPref(cookKey(line), { variantRef: variant.ref });
  };
  const pickDry = (cooked: boolean) => {
    onChange({ weighedCooked: cooked });
    corrections?.saveCookPref(cookKey(line), { weighedCooked: cooked });
  };
  const perPortionOnly = line.unit === "portion" && !line.portionGrams;
  const isPackage = line.unit === "portion" && line.portionLabel === PACKAGE_LABEL && !!line.packageGrams;
  const isPiece = line.unit === "portion" && !!line.pieceGrams && line.portionGrams === line.pieceGrams && line.portionLabel === line.pieceLabel;
  // La pièce n'est un choix à part que si elle diffère de la portion (« 1 portion (80 g) » ≠ « 1 tranche »).
  const hasPiece = !!line.pieceGrams && line.pieceGrams !== line.servingGrams;
  const massUnit = line.liquid ? "ml" : "g";
  /** Recette du carnet : on choisit le nombre de parts mangées sur le plat entier. */
  const servings = line.source === "recette" ? line.recipePortions : undefined;
  const plural = (count: number) => (count > 1 ? "s" : "");
  /** Recette : la quantité peut se compter en morceaux ou en grammes (elle reste gardée en parts). */
  const wantedCount = servings ? line.recipeCount ?? "parts" : "parts";
  const countTotal = wantedCount === "pieces" ? line.recipePieces : wantedCount === "grams" ? line.recipeGrams : undefined;
  const counted = !!servings && !!countTotal;
  /** Morceaux ou grammes dans une part. */
  const perPart = counted ? countTotal! / servings! : 1;
  const [totalDraft, setTotalDraft] = useState("");
  /** Nombre de parts du plat entier, modifiable sur la ligne (« 1 part sur 20 »). */
  const [denominatorDraft, setDenominatorDraft] = useState<string | null>(null);
  const commitDenominator = () => {
    const value = Math.round(Number((denominatorDraft ?? "").replace(",", ".")));
    setDenominatorDraft(null);
    if (!servings || !(value >= 1) || value > 500) return;
    // Le nombre de parts mangées reste le même (1 part), sur un plat partagé autrement.
    const eaten = Math.max(1, Math.round((counted ? line.quantity * perPart : line.quantity) * 2) / 2);
    if (value === servings) onChange({ recipeCount: undefined, quantity: eaten });
    else onChange({ recipeCount: "pieces", recipePieces: value, quantity: (eaten * servings) / value });
  };
  const [portionDraft, setPortionDraft] = useState("");
  /** Poids d'une portion donné à la main : l'aliment se compte ensuite aussi en grammes (retenu pour la prochaine fois). */
  const setPortionWeight = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Math.round(Number(portionDraft.replace(",", ".")));
    if (!(value > 0) || value > 3000) return;
    onChange(withPortionWeight(line, value));
    corrections?.saveCookPref(cookKey(line), { portionGrams: value });
    setPortionDraft("");
  };

  /** Grammes / ml : on garde la même quantité. Contenant, cuillère ou portion touchés : on en compte 1
      (toucher « grand verre » = 1 grand verre de 300 ml, pas « 0,75 grand verre »). */
  const useUnit = (unit: "g" | { label: string; grams: number }) => {
    const total = grams ?? line.quantity;
    if (unit === "g") onChange({ unit: "g", quantity: Math.round(total) });
    else onChange({ unit: "portion", portionGrams: unit.grams, portionLabel: unit.label, quantity: 1 });
  };
  const step = (direction: 1 | -1) => {
    if (counted) {
      const shown = line.quantity * perPart;
      const size = wantedCount === "grams" ? 10 : shown > 1 || (direction > 0 && shown >= 1) ? 1 : 0.5;
      onChange({ quantity: Math.max(size, Math.round((shown + direction * size) * 100) / 100) / perPart });
      return;
    }
    // Les pièces se comptent une à une (« 10 tranches ») ; en dessous de 1, par moitié.
    const size = line.unit === "g" ? (line.liquid ? 50 : 10) : isPackage || servings ? (servings && line.quantity >= 1 ? 0.5 : 0.25) : line.liquid || (direction > 0 ? line.quantity >= 1 : line.quantity > 1) ? 1 : 0.5;
    onChange({ quantity: Math.max(size, Math.round((line.quantity + direction * size) * 100) / 100) });
  };

  // Unités proposées pour un aliment solide : sa portion habituelle, la boîte, les grammes.
  const options: { key: string; label: string; selected: boolean; pick: () => void }[] = [];
  if (!perPortionOnly && !line.liquid) {
    // Aliment repris d'un ancien repas (sans portion habituelle gardée) : sa portion reste un choix,
    // pour pouvoir passer en grammes (50 g de banane) et revenir.
    if (line.portionGrams && !line.servingGrams && !hasPiece && line.portionLabel !== PACKAGE_LABEL) {
      options.push({ key: "portion", label: unitName(line.portionLabel), selected: line.unit === "portion", pick: () => useUnit({ label: line.portionLabel ?? "1 portion", grams: line.portionGrams! }) });
    }
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
      options.push({ key: "package", label: `paquet ${amount(line.packageGrams)}`, selected: isPackage, pick: () => useUnit({ label: PACKAGE_LABEL, grams: line.packageGrams! }) });
    }
    // Cuillère à café / à soupe : ≈ 5 g et ≈ 15 g (repère ; pour l'huile ou la farine, corriger en grammes).
    if (spoonFood.test(normalize(line.name))) {
      spoons.forEach((spoon) => options.push({ key: spoon.label, label: `${spoon.label} ≈${spoon.ml} g`, selected: line.unit === "portion" && line.portionLabel === `1 ${spoon.label}`, pick: () => useUnit({ label: `1 ${spoon.label}`, grams: spoon.ml }) }));
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
            value={counted ? Math.round(line.quantity * perPart * 100) / 100 : Math.round((line.quantity / volumeFactor) * 100) / 100}
            onChange={(e) => onChange({ quantity: counted ? Math.max(0, Number(e.target.value)) / perPart : Math.max(0, Number(e.target.value)) * volumeFactor })}
            aria-label={`Quantité de ${line.name}`}
          />
          <button type="button" onClick={() => step(1)} aria-label="Plus"><Icon name="plus" size={15} /></button>
        </div>
        {/* Boisson en volume : saisie en ml, cl, dl ou L (gardée en ml). */}
        {inVolume && (
          <select className="volume-unit" value={volumeUnit} onChange={(e) => onChange({ volumeUnit: e.target.value as VolumeUnit })} aria-label="Unité de volume">
            {volumeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.id}</option>)}
          </select>
        )}
        {!inVolume && (line.liquid || perPortionOnly || options.length < 2) && (
          <span className="unit-fixed">
            {line.unit === "g" ? massUnit : counted && wantedCount === "grams" ? `g sur ${n(line.recipeGrams!)} g` : servings && wantedCount !== "grams" ? (
              // « 1 part sur [20] » : le nombre de parts du plat se change ici (plat partagé en 20).
              <span className="denominator">
                {counted ? `part${line.quantity * perPart > 1 ? "s" : ""}` : `part${plural(line.quantity)}`} sur
                <input type="number" inputMode="numeric" min="1" value={denominatorDraft ?? String(counted ? line.recipePieces : servings)} onChange={(e) => setDenominatorDraft(e.target.value)} onBlur={commitDenominator} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDenominator(); } }} aria-label="Nombre de parts du plat entier" />
              </span>
            ) : `${unitName(line.portionLabel)}${line.quantity > 1 && line.liquid ? "s" : ""}`}
          </span>
        )}
        {line.unit === "portion" && grams && !(counted && wantedCount === "grams") ? <span className="drink-total">= {amount(grams, line.liquid)}</span> : null}
      </div>

      {options.length >= 2 && (
        <div className="container-chips" role="radiogroup" aria-label="Unité">
          {options.map((option) => (
            <button type="button" role="radio" aria-checked={option.selected} key={option.key} className={option.selected ? "selected" : ""} onClick={option.pick}>{option.label}</button>
          ))}
        </div>
      )}

      {/* Connu seulement par portion (cookie Subway, aliment perso) : avec son poids, on peut compter en grammes. */}
      {needsPortionWeight(line) && (
        <form className="recipe-total" onSubmit={setPortionWeight}>
          <span>Compter en grammes : {line.portionLabel ?? "1 portion"} pèse</span>
          <input value={portionDraft} onChange={(e) => setPortionDraft(e.target.value)} inputMode="decimal" placeholder="—" aria-label="Poids d'une portion en grammes" />
          <span>g</span>
          <button type="submit" className="text-button" disabled={!(Number(portionDraft.replace(",", ".")) > 0)}>OK</button>
          <small>Le poids est gardé pour la prochaine fois. Les calories de la portion ne changent pas.</small>
        </form>
      )}

      {onAdapt && servings && (
        <button type="button" className="text-button adapt-recipe" onClick={onAdapt}>✎ Adapter les ingrédients pour ce repas</button>
      )}
      {/* Recette : compter en parts, en morceaux (gâteau coupé en 12) ou en grammes (plat pesé). */}
      {servings && (
        <div className="container-chips" role="radiogroup" aria-label="Compter la recette en">
          {([["parts", "parts"], ["pieces", "morceaux"], ["grams", "g / ml"]] as const).map(([id, label]) => (
            <button type="button" role="radio" aria-checked={wantedCount === id} key={id} className={wantedCount === id ? "selected" : ""} onClick={() => { setTotalDraft(""); onChange({ recipeCount: id === "parts" ? undefined : id }); }}>{label}</button>
          ))}
        </div>
      )}
      {servings && wantedCount !== "parts" && (
        <form className="recipe-total" onSubmit={(event) => {
          event.preventDefault();
          const value = Number(totalDraft.replace(",", "."));
          // Premier découpage en morceaux : 1 morceau (et non le plat entier).
          if (value > 0) { onChange(wantedCount === "pieces" ? { recipePieces: Math.round(value), ...(line.recipePieces ? {} : { quantity: servings! / Math.round(value) }) } : { recipeGrams: Math.round(value), recipeGramsEstimated: undefined }); setTotalDraft(""); }
        }}>
          <span>{wantedCount === "pieces" ? "Le plat entier est coupé en" : line.recipeGramsEstimated ? `Le plat entier pèse ≈ ${n(line.recipeGrams!)} g (somme des ingrédients). Pesé :` : "Le plat entier pèse"}</span>
          <input value={totalDraft} onChange={(e) => setTotalDraft(e.target.value)} inputMode="decimal" placeholder={countTotal ? n(countTotal) : "—"} aria-label={wantedCount === "pieces" ? "Nombre de morceaux du plat entier" : "Poids du plat entier en grammes"} />
          <span>{wantedCount === "pieces" ? "morceaux" : "g (ou ml)"}</span>
          <button type="submit" className="text-button" disabled={!(Number(totalDraft.replace(",", ".")) > 0)}>{countTotal ? "Changer" : "OK"}</button>
          {!countTotal && <small>Indique-le une fois : il est gardé dans la recette.</small>}
          {wantedCount === "grams" && line.recipeGramsEstimated && <small>Plat cuit (l'eau s'évapore) : pèse-le et corrige ce poids. Boisson : 1 ml ≈ 1 g.</small>}
        </form>
      )}

      {/* Recette pour plusieurs : parts mangées, jusqu'au plat entier. */}
      {servings && !counted && (
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
          {[...(line.packageGrams ? [{ label: "emballage", ml: line.packageGrams }] : []), ...spoons, ...containers].map((container) => {
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

      {/* Viande, poisson, œuf (Ciqual) pesés : la fiche crue ou la fiche cuite. Compté à la pièce
          (« 1 filet »), le poids est celui du cru : pas de choix. */}
      {variants.length > 1 && line.unit === "g" && (
        <div className="container-chips" role="radiogroup" aria-label="Pesé cru ou cuit">
          <small className="chips-label">Pesé :</small>
          {variants.map((variant) => {
            const selected = variant.ref === line.ref;
            return (
              <button type="button" role="radio" aria-checked={selected} key={variant.ref} className={selected ? "selected" : ""} onClick={() => pickVariant(variant)}>
                {variant.label} <small>{variant.kcal100} kcal</small>
              </button>
            );
          })}
        </div>
      )}
      {/* Riz, pâtes… vendus secs : pesés secs (avant cuisson) ou cuits (dans l'assiette). */}
      {line.cookedFactor && line.unit === "g" && (
        <>
          <div className="container-chips" role="radiogroup" aria-label="Pesé">
            <small className="chips-label">Pesé :</small>
            <button type="button" role="radio" aria-checked={!line.weighedCooked} className={!line.weighedCooked ? "selected" : ""} onClick={() => pickDry(false)}>sec, avant cuisson</button>
            <button type="button" role="radio" aria-checked={!!line.weighedCooked} className={line.weighedCooked ? "selected" : ""} onClick={() => pickDry(true)}>cuit</button>
          </div>
          {line.weighedCooked && <small className="meal-line-detail">{n(Math.round(line.quantity))} g cuits ≈ {n(Math.round(nutrientGrams(line)))} g secs ≈ {n(Math.round(itemCalories(line)))} kcal ({line.cookedBy === "emballage" ? "conversion indiquée sur l'emballage" : "la fiche est celle du produit sec"})</small>}
        </>
      )}
      {/* Ligne compacte : nutriments, source et étiquette derrière « Détails ». */}
      <button type="button" className="text-button line-details-toggle" aria-expanded={details} onClick={() => setDetails((value) => !value)}>
        {details ? "Masquer les détails" : `Détails${itemCarbs(line) !== null ? ` · ${n(Math.round(itemCarbs(line)! * 10) / 10)} g de glucides` : ""} ›`}
      </button>
      {details && (itemCarbs(line) !== null || itemFat(line) !== null) && (
        <small className="meal-line-carbs">
          {[itemCarbs(line) !== null ? `${n(Math.round(itemCarbs(line)! * 10) / 10)} g de glucides` : "", itemFat(line) !== null ? `${n(Math.round(itemFat(line)! * 10) / 10)} g de lipides` : ""].filter(Boolean).join(" · ")}
        </small>
      )}
      {details && extras.length > 0 && <small className="meal-line-carbs meal-line-extras">{extras.join(" · ")}</small>}
      {/* Boisson prête à boire enregistrée par erreur en grammes (thé glacé pris pour un sachet). */}
      {!line.liquid && (isReadyDrink(line.name) || (line.prepared && line.kcal100 >= 5 && line.kcal100 <= 100)) && (
        <button type="button" className="hydrate-toggle" onClick={() => onChange({ liquid: true, prepared: undefined, waterMl: undefined, hydrates: undefined })}>
          🥤 C'est une boisson prête à boire : compter en ml
        </button>
      )}
      {/* Sachet de thé, café soluble, sirop… : la boisson préparée compte, pas le sachet. */}
      {!hideHydration && isPreparedDrink(line) && (
        <div className="prepared-drink">
          <small className="chips-label">💧 Préparé avec :</small>
          <div className="container-chips" role="radiogroup" aria-label="Volume de la boisson préparée">
            {containers.filter((container) => container.ml <= 500).map((container) => {
              const selected = line.waterMl === container.ml;
              return (
                <button type="button" role="radio" aria-checked={selected} key={container.label} className={selected ? "selected" : ""} onClick={() => onChange({ waterMl: container.ml, hydrates: undefined })}>
                  {container.label} <small>{volume(container.ml)}</small>
                </button>
              );
            })}
          </div>
          <label className="prepared-custom">
            <small>ou autre volume :</small>
            <input type="number" inputMode="numeric" min="0" step="10" value={line.waterMl && !containers.some((container) => container.ml === line.waterMl) ? line.waterMl : ""} placeholder="—" onChange={(e) => onChange({ waterMl: Math.max(0, Math.round(Number(e.target.value))) || undefined })} aria-label="Volume préparé en ml" />
            <small>ml</small>
          </label>
          <small className={`meal-line-detail${line.waterMl ? " prepared-on" : ""}`}>
            {line.waterMl ? `${volume(line.waterMl)} comptés dans l'hydratation` : "Choisis le volume bu pour le compter dans l'hydratation."}
          </small>
        </div>
      )}
      {/* Hydratation : boissons comptées d'office ; soupe, lait… au choix. */}
      {!hideHydration && !isPreparedDrink(line) && (line.liquid || line.drinkMlPerPart || couldHydrate(line)) && (
        <button type="button" className={`hydrate-toggle${drinkMl(line) > 0 ? " on" : ""}`} aria-pressed={drinkMl(line) > 0}
          onClick={() => onChange({ hydrates: drinkMl(line) > 0 ? false : true })}>
          {drinkMl(line) > 0 ? `💧 ${volume(drinkMl(line))} dans l'hydratation` : "💧 Compter dans l'hydratation"}
        </button>
      )}
      {[quantityWarning(line)].filter(Boolean).map((warning) => <small className="meal-line-warning" key={warning}>⚠ {warning}</small>)}
      {coherenceWarnings(line).map((warning) => <small className="meal-line-warning" key={warning}>⚠ {warning}</small>)}
      {details && (<>
      <div className="meal-line-source">
        <span className={`reliability ${reliability.tone}`}>{reliability.label}</span>
        {corrections && canCheckLabel(line) && !checking && (
          <button type="button" className="text-button" onClick={() => setChecking(true)}>Vérifier avec l'étiquette</button>
        )}
      </div>
      {checking && <LabelCheck line={line} onChange={onChange} onClose={() => setChecking(false)} />}
      {corrections && line.source !== "recette" && !corrections.pantry.some((entry) => correctionKey(entry) === correctionKey(line)) && (
        <button type="button" className="text-button" onClick={() => corrections.savePantry(toPantry(line))}>☆ Garder dans mes ingrédients</button>
      )}
      {/* Produit sans photo : on peut en ajouter une, pour le repérer d'un coup d'œil dans les listes. */}
      {corrections && line.source !== "recette" && (
        <div className="product-photo">
          {ownImage && <img src={ownImage} alt="" />}
          <span className="sub-label">{ownImage ? "Photo du produit :" : "Ajouter une photo du produit :"}</span>
          <button type="button" className="text-button" onClick={() => photoInput.current?.click()}><Icon name="camera" size={15} /> Photo</button>
          <button type="button" className="text-button" onClick={() => galleryInput.current?.click()}><Icon name="image" size={15} /> Galerie</button>
          {ownImage && <button type="button" className="text-button" onClick={() => corrections.saveImage(correctionKey(line), null)}>Retirer</button>}
          {[photoInput, galleryInput].map((ref, index) => (
            <input key={index} ref={ref} className="hidden-input" type="file" accept="image/*" {...(index === 0 ? { capture: "environment" as const } : {})} onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) shrinkImage(file, 160).then((image) => corrections.saveImage(correctionKey(line), image)).catch(() => undefined);
            }} />
          ))}
        </div>
      )}
      <small className="meal-line-detail">
        {servings ? `Ma recette pour ${servings} pers. · ${Math.round(line.kcal100)} kcal la part` : `Base : ${n(Math.round(line.kcal100))} kcal ${perPortionOnly ? "par portion" : `pour 100 ${line.liquid && !per100g ? "ml" : "g"}`} · ${line.matchedName ? `${line.matchedName} (${sourceName[line.source]})` : sourceName[line.source]}`}
      </small>
      {/* Liquide dont la fiche est pour 100 g (Ciqual) : densité pour passer des ml aux grammes. */}
      {per100g && inVolume && (
        <label className="density-line">
          <small>1 ml ≈</small>
          <input type="number" inputMode="decimal" min="0.3" max="3" step="0.01" value={line.density ?? 1} onChange={(e) => { const value = Number(e.target.value); onChange({ density: value > 0 && value !== 1 ? value : undefined }); }} aria-label="Densité en grammes par ml" />
          <small>g · {n(Math.round(nutrientGrams(line)))} g comptés</small>
        </label>
      )}
      </>)}
    </div>
  );
}

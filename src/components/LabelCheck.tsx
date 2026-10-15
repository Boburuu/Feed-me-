import { useRef, useState } from "react";
import Icon from "./Icon";
import { correctionKey, type ProductCorrection } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";
import { compareWithLabel, parseNutritionLabel, type LabelReading, type NutrientKey } from "../lib/nutritionLabel";
import { readImageBoxes } from "../lib/ocr";
import type { MealItem } from "../lib/storage";

type LabelCheckProps = {
  line: MealItem;
  onChange: (change: Partial<MealItem>) => void;
  onClose: () => void;
};

/** Nutriments suivis par l'app, comparés un à un. */
const tracked: { key: NutrientKey; label: string; unit: string; field: "kcal100" | "protein100" | "carbs100" | "fat100" }[] = [
  { key: "kcal", label: "Énergie", unit: "kcal", field: "kcal100" },
  { key: "protein", label: "Protéines", unit: "g", field: "protein100" },
  { key: "carbs", label: "Glucides", unit: "g", field: "carbs100" },
  { key: "fat", label: "Lipides", unit: "g", field: "fat100" },
];

type Step = { step: "menu" } | { step: "reading" } | { step: "compare"; reading: LabelReading | null; note?: string } | { step: "done"; message: string };

const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const toNumber = (text: string) => (text.trim() === "" ? null : Number(text.replace(",", ".")));

/**
 * « Vérifier avec l'étiquette » : photo du tableau nutritionnel, lecture des valeurs pour
 * 100 g, comparaison avec la fiche. Les valeurs lues restent modifiables ; rien ne change
 * sans un choix explicite (corriger ma version, garder la fiche, signaler l'erreur).
 */
export default function LabelCheck({ line, onChange, onClose }: LabelCheckProps) {
  const api = useCorrections();
  const [state, setState] = useState<Step>({ step: "menu" });
  const [values, setValues] = useState<Record<NutrientKey, string>>({ kcal: "", fat: "", satFat: "", carbs: "", sugars: "", fiber: "", protein: "", salt: "" });
  const [recount, setRecount] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const base = line.liquid ? "100 ml" : "100 g";

  const read = async (file: File) => {
    setState({ step: "reading" });
    try {
      const reading = parseNutritionLabel(await readImageBoxes(file));
      const found = tracked.filter(({ key }) => reading.per100[key] !== undefined).length;
      const unsure = tracked.filter(({ key }) => reading.unsure.includes(key) && reading.per100[key] === undefined).map((item) => item.label.toLowerCase());
      setValues((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(reading.per100)) next[key as NutrientKey] = n(value);
        return next;
      });
      setState({
        step: "compare",
        reading,
        note: unsure.length ? `Lecture incertaine pour : ${unsure.join(", ")}. Tapez ${unsure.length > 1 ? "ces valeurs" : "cette valeur"} et vérifiez les autres.` : found === 0 ?"Aucune valeur lue : photographiez le tableau de près, bien à plat, ou tapez les valeurs." : found < tracked.length ? "Lecture partielle : vérifiez et complétez les valeurs." : "Valeurs lues : vérifiez-les avec l'étiquette avant de choisir.",
      });
    } catch {
      setState({ step: "compare", reading: null, note: "Lecture impossible : tapez les valeurs de l'étiquette." });
    }
  };

  const label = Object.fromEntries(tracked.flatMap(({ key }) => (toNumber(values[key]) !== null && Number.isFinite(toNumber(values[key])) ? [[key, toNumber(values[key])!]] : [])));
  const app = Object.fromEntries(tracked.flatMap(({ key, field }) => (line[field] != null ? [[key, line[field] as number]] : [])));
  const rows = compareWithLabel(app, label).filter((row) => tracked.some((item) => item.key === row.key));
  const differs = rows.some((row) => row.status === "check" || (row.app === null && row.label !== null));
  const canDecide = label.kcal !== undefined;

  const key = correctionKey(line);
  const correction: ProductCorrection | null = canDecide ? {
    name: line.name,
    kcal100: label.kcal!,
    protein100: label.protein ?? line.protein100 ?? null,
    carbs100: label.carbs ?? line.carbs100 ?? null,
    fat100: label.fat ?? line.fat100 ?? null,
    // Sucres, saturés, fibres, sel lus sur l'étiquette (ou tapés) : gardés aussi.
    ...Object.fromEntries((["sugars", "satFat", "fiber", "salt"] as const).flatMap((key) => { const value = toNumber(values[key]); return value !== null && Number.isFinite(value) ? [[`${key}100`, value]] : []; })),
    original: { kcal100: line.kcal100, protein100: line.protein100, carbs100: line.carbs100, fat100: line.fat100 },
    date: new Date().toISOString().slice(0, 10),
  } : null;
  const past = correction && api ? api.pastMeals(key, correction) : 0;
  const offCode = line.source === "off" && /^\d{8,14}$/.test(line.ref ?? "") ? line.ref : null;

  const correct = () => {
    if (!correction || !api) return;
    api.save(key, correction, recount);
    // L'étiquette fait foi : plus d'alerte « valeur inhabituelle » sur cette ligne.
    onChange({ refKcal100: undefined, refName: undefined, labelChecked: undefined, kcal100: correction.kcal100, protein100: correction.protein100, carbs100: correction.carbs100, fat100: correction.fat100, corrected: true });
    setState({ step: "done", message: `Ta version de « ${line.name} » est enregistrée : elle sera utilisée chaque fois que tu ajoutes ce produit.${recount && past ? ` ${past} repas recalculé${past > 1 ? "s" : ""}.` : ""}` });
  };

  const portion = state.step === "compare" ? state.reading?.portionGrams : undefined;
  const portionKcal = state.step === "compare" ? state.reading?.perPortion.kcal : undefined;

  return (
    <section className="label-check">
      <div className="barcode-head">
        <strong>Vérifier avec l'étiquette</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer la vérification"><Icon name="close" size={15} /></button>
      </div>

      {state.step === "menu" && (
        <>
          <small className="barcode-hint">Photographiez le tableau « Valeurs nutritionnelles » du paquet : l'app lit la colonne « pour {base} » et la compare à sa fiche.</small>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={() => cameraInput.current?.click()}><Icon name="camera" size={16} /> Prendre le tableau en photo</button>
            <button type="button" className="add-part" onClick={() => galleryInput.current?.click()}><Icon name="image" size={16} /> Photo de la galerie</button>
            <button type="button" className="add-part" onClick={() => setState({ step: "compare", reading: null })}><Icon name="edit" size={16} /> Taper les valeurs</button>
          </div>
        </>
      )}

      {state.step === "reading" && <p className="food-hint"><span className="loader" /> Lecture de l'étiquette…</p>}

      {state.step === "compare" && (
        <>
          {state.note && <p className="food-hint">{state.note}</p>}
          <div className="label-table" role="table" aria-label={`Fiche et étiquette, pour ${base}`}>
            <div className="label-row label-row-head" role="row">
              <span role="columnheader">Pour {base}</span>
              <span role="columnheader">Fiche</span>
              <span role="columnheader">Étiquette</span>
            </div>
            {tracked.map((item) => {
              const row = rows.find((entry) => entry.key === item.key)!;
              return (
                <div className={`label-row ${row.status}`} role="row" key={item.key}>
                  <span role="cell">{item.label}</span>
                  <span role="cell">{row.app === null ? "—" : `${n(Math.round(row.app * 10) / 10)} ${item.unit}`}</span>
                  <span role="cell" className="label-input">
                    <input inputMode="decimal" value={values[item.key]} onChange={(e) => setValues((current) => ({ ...current, [item.key]: e.target.value }))} aria-label={`${item.label} sur l'étiquette`} />
                    <small>{item.unit}</small>
                  </span>
                  {row.gap !== null && row.status === "check" && <small className="label-gap" role="cell">écart {row.gap > 0 ? "+" : ""}{n(Math.round(row.gap))} %</small>}
                </div>
              );
            })}
          </div>
          {portion && portionKcal !== undefined && <small className="barcode-hint">Étiquette : portion de {n(portion)} g = {n(portionKcal)} kcal.</small>}

          {!canDecide && <small className="barcode-hint">Indiquez au moins l'énergie (kcal) de l'étiquette pour comparer.</small>}
          {canDecide && !differs && (
            <>
              <p className="label-verdict ok">✓ La fiche correspond à l'étiquette (les petits écarts sont des arrondis).</p>
              <div className="barcode-actions">
                <button type="button" className="text-button" onClick={onClose}>Fermer</button>
                <button type="button" className="plan-confirm" onClick={() => { onChange({ labelChecked: true }); setState({ step: "done", message: "Fiche marquée comme vérifiée avec l'étiquette." }); }}><Icon name="check" size={14} /> Marquer vérifiée</button>
              </div>
            </>
          )}
          {canDecide && differs && (
            <>
              <p className="label-verdict check">La fiche diffère de l'étiquette. Que faire ?</p>
              {past > 0 && (
                <label className="planned-toggle">
                  <input type="checkbox" checked={recount} onChange={(e) => setRecount(e.target.checked)} />
                  <span>Recalculer aussi {past} repas déjà noté{past > 1 ? "s" : ""} avec ce produit (sinon ils restent tels quels)</span>
                </label>
              )}
              <div className="barcode-choices">
                <button type="button" className="add-part" onClick={correct}><Icon name="check" size={16} /> Corriger ma version locale</button>
                <button type="button" className="add-part" onClick={onClose}><Icon name="close" size={16} /> Garder la fiche d'origine</button>
                {offCode && (
                  <a className="add-part" href={`https://world.openfoodfacts.org/product/${offCode}`} target="_blank" rel="noreferrer">
                    <Icon name="edit" size={16} /> Signaler l'erreur sur Open Food Facts
                  </a>
                )}
              </div>
              {!offCode && line.source === "ciqual" && <small className="barcode-hint">Ciqual donne une moyenne pour ce type d'aliment : un produit de marque peut en différer sans erreur.</small>}
            </>
          )}
        </>
      )}

      {state.step === "done" && (
        <>
          <p className="food-hint">{state.message}</p>
          <div className="barcode-actions"><span /><button type="button" className="plan-confirm" onClick={onClose}><Icon name="check" size={14} /> OK</button></div>
        </>
      )}

      <input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void read(file); }} />
      <input ref={galleryInput} className="hidden-input" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void read(file); }} />
    </section>
  );
}

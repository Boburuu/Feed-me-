import { useRef, useState } from "react";
import FoodPicker from "./FoodPicker";
import FoodResultRow from "./FoodResultRow";
import Icon from "./Icon";
import { correctionKey } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";
import { toMealItem } from "../lib/foods";
import { shrinkImage } from "../lib/images";
import { pantryResult, toPantry, withPieceSize, type PantryItem } from "../lib/pantry";

type PantryPanelProps = {
  flash: (message: string) => void;
};

const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Réglages d'un ingrédient gardé : taille d'une pièce (ou du paquet), photo, retrait. */
function PantryEditor({ item, onClose, flash }: { item: PantryItem; onClose: () => void; flash: (message: string) => void }) {
  const corrections = useCorrections()!;
  const [label, setLabel] = useState((item.pieceLabel ?? "").replace(/^1\s+/, "") || "tranche");
  const [grams, setGrams] = useState(item.pieceGrams ? String(item.pieceGrams) : "");
  const [count, setCount] = useState("");
  const [pack, setPack] = useState(item.packageGrams ? String(item.packageGrams) : "");
  const photoInput = useRef<HTMLInputElement>(null);
  const key = correctionKey(item);
  const image = corrections.images[key];
  const toNumber = (text: string) => Number(text.replace(",", ".")) || undefined;

  const saveSize = () => {
    const next = withPieceSize(item, { label, grams: toNumber(grams), count: toNumber(count), packageGrams: toNumber(pack) });
    if (next === item) { flash("Indique le poids d'une pièce, ou le paquet et le nombre de pièces"); return; }
    corrections.savePantry(next);
    flash(`${next.pieceLabel} ≈ ${n(next.pieceGrams!)} g`);
    onClose();
  };

  return (
    <div className="pantry-editor">
      <p className="food-section">Taille d'une pièce</p>
      <div className="pantry-fields">
        <label>Pièce<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="tranche, pot, biscuit…" /></label>
        <label>Poids d'une pièce<div><input value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="decimal" placeholder="—" /><small>g</small></div></label>
      </div>
      <small className="food-hint">Ou le paquet : la pièce est calculée.</small>
      <div className="pantry-fields">
        <label>Pièces dans le paquet<input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" placeholder="4" /></label>
        <label>Poids du paquet<div><input value={pack} onChange={(e) => setPack(e.target.value)} inputMode="decimal" placeholder="160" /><small>g</small></div></label>
      </div>
      <div className="pantry-actions">
        <button type="button" className="plan-confirm" onClick={saveSize}><Icon name="check" size={14} /> Enregistrer la taille</button>
        <button type="button" className="text-button" onClick={() => photoInput.current?.click()}>{image ? "Changer la photo" : "📷 Ajouter une photo"}</button>
        <button type="button" className="text-button danger-text" onClick={() => { corrections.removePantry(item.pantryId); flash(`« ${item.name} » retiré de mes ingrédients`); onClose(); }}>Retirer</button>
      </div>
      <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) shrinkImage(file, 160).then((src) => corrections.saveImage(key, src)).catch(() => flash("Photo illisible"));
      }} />
    </div>
  );
}

/** Onglet « Mes ingrédients » du carnet : la liste rapide de produits à réutiliser. */
export default function PantryPanel({ flash }: PantryPanelProps) {
  const corrections = useCorrections();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  if (!corrections) return null;
  const { pantry } = corrections;

  return (
    <section className="pantry">
      <p className="theme-description">Garde ici les produits que tu achètes souvent (jambon Herta, skyr…), avec leur photo et la taille d'une tranche ou d'un pot. Tu les retrouves dans « Ajouter un repas » et dans les ingrédients des recettes, onglet « Mes ingrédients ».</p>
      {adding ? (
        <FoodPicker onPick={(food) => {
          const item = toPantry(toMealItem(food));
          if (pantry.some((entry) => correctionKey(entry) === correctionKey(item))) { flash(`« ${item.name} » est déjà dans tes ingrédients`); return; }
          corrections.savePantry(item);
          setOpenId(item.pantryId);
          flash(`« ${item.name} » ajouté à mes ingrédients`);
        }}>
          <button type="button" className="text-button" onClick={() => setAdding(false)}>Terminé</button>
        </FoodPicker>
      ) : (
        <button type="button" className="create-recipe" onClick={() => setAdding(true)}>
          <span><Icon name="plus" /></span>
          <div><strong>Ajouter un ingrédient</strong><small>Recherche, code-barres, photo du paquet ou fast-food</small></div>
          <Icon name="chevron" size={18} />
        </button>
      )}
      {pantry.length === 0 && !adding && <p className="food-hint">Aucun ingrédient pour l'instant.</p>}
      <div className="food-results">
        {pantry.map((item) => (
          <div key={item.pantryId} className="pantry-row">
            <FoodResultRow result={pantryResult(item)} onPick={() => setOpenId(openId === item.pantryId ? null : item.pantryId)} />
            {openId === item.pantryId && <PantryEditor item={item} onClose={() => setOpenId(null)} flash={flash} />}
          </div>
        ))}
      </div>
    </section>
  );
}

import { useRef, useState } from "react";
import FoodPicker from "./FoodPicker";
import FoodResultRow from "./FoodResultRow";
import Icon from "./Icon";
import ShareSheet from "./ShareSheet";
import { ingredientsPayload, type SharePayload } from "../lib/share";
import { correctionKey } from "../lib/corrections";
import { useCorrections } from "../lib/correctionsContext";
import { toMealItem } from "../lib/foods";
import { shrinkImage } from "../lib/images";
import { gramsOnly, pantryMode, pantryResult, toPantry, withPackage, withPieceSize, type PantryItem } from "../lib/pantry";

type PantryPanelProps = {
  flash: (message: string) => void;
};

type Mode = "grams" | "piece" | "package";
const n = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const pieceNames = ["tranche", "pot", "biscuit", "part", "barre", "boule"];
const toNumber = (text: string) => Number(text.replace(",", ".")) || undefined;

/** Réglages d'un ingrédient gardé : comment on l'utilise (grammes, pièce, sachet), photo, retrait. */
function PantryEditor({ item, onClose, onShare, flash }: { item: PantryItem; onClose: () => void; onShare: () => void; flash: (message: string) => void }) {
  const corrections = useCorrections()!;
  const [mode, setMode] = useState<Mode>(pantryMode(item));
  const [label, setLabel] = useState((item.pieceLabel ?? "").replace(/^1\s+/, "") || "tranche");
  const [grams, setGrams] = useState(item.pieceGrams ? String(item.pieceGrams) : "");
  const [count, setCount] = useState("");
  const [pack, setPack] = useState(item.packageGrams ? String(item.packageGrams) : "");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const key = correctionKey(item);
  const image = corrections.images[key];

  const save = () => {
    let next: PantryItem = item;
    if (mode === "grams") next = gramsOnly(item);
    if (mode === "package") next = withPackage(item, toNumber(pack) ?? 0);
    if (mode === "piece") next = withPieceSize(item, { label, grams: toNumber(grams), count: toNumber(count), packageGrams: toNumber(pack) });
    if (mode !== "grams" && next === item) {
      flash(mode === "package" ? "Indique le poids du sachet ou du paquet" : "Indique le poids d'une pièce, ou le nombre de pièces et le poids du paquet");
      return;
    }
    corrections.savePantry(next);
    flash(mode === "grams" ? `${item.name} : en grammes` : mode === "package" ? `${item.name} : sachet de ${n(next.packageGrams!)} g` : `${next.pieceLabel} ≈ ${n(next.pieceGrams!)} g`);
    onClose();
  };
  const addPhoto = (file?: File) => {
    if (file) shrinkImage(file, 160).then((src) => corrections.saveImage(key, src)).catch(() => flash("Photo illisible"));
  };

  return (
    <div className="pantry-editor">
      <p className="food-section">Je l'utilise…</p>
      <div className="sex-selector pantry-mode" role="radiogroup" aria-label="Façon de l'utiliser">
        {([["grams", "en grammes"], ["piece", "à la pièce"], ["package", "au sachet"]] as const).map(([id, text]) => (
          <button type="button" role="radio" aria-checked={mode === id} key={id} className={mode === id ? "selected" : ""} onClick={() => setMode(id)}>{text}</button>
        ))}
      </div>

      {mode === "grams" && <small className="food-hint">Tu indiques les grammes à chaque fois (ex. 30 g de mozzarella râpée).</small>}

      {mode === "package" && (
        <>
          <div className="pantry-fields single">
            <label>Poids du sachet ou du paquet<div><input value={pack} onChange={(e) => setPack(e.target.value)} inputMode="decimal" placeholder="150" /><small>g</small></div></label>
          </div>
          <small className="food-hint">Tu choisiras ensuite le sachet entier, ½, ¼… ou des grammes.</small>
        </>
      )}

      {mode === "piece" && (
        <>
          <div className="container-chips" role="radiogroup" aria-label="Pièce">
            {pieceNames.map((name) => (
              <button type="button" role="radio" aria-checked={label === name} key={name} className={label === name ? "selected" : ""} onClick={() => setLabel(name)}>{name}</button>
            ))}
          </div>
          <div className="pantry-fields">
            <label>Autre pièce<input value={pieceNames.includes(label) ? "" : label} onChange={(e) => setLabel(e.target.value || "tranche")} placeholder="ex. galette" /></label>
            <label>Poids d'une {label}<div><input value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="decimal" placeholder="—" /><small>g</small></div></label>
          </div>
          <small className="food-hint">Ou le paquet, et la {label} est calculée :</small>
          <div className="pantry-fields">
            <label>Nombre de {label}s<input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" placeholder="4" /></label>
            <label>Poids du paquet<div><input value={pack} onChange={(e) => setPack(e.target.value)} inputMode="decimal" placeholder="160" /><small>g</small></div></label>
          </div>
        </>
      )}

      <button type="button" className="plan-confirm" onClick={save}><Icon name="check" size={14} /> Enregistrer</button>

      <p className="food-section">Photo</p>
      <div className="product-photo">
        {image && <img src={image} alt="" />}
        <button type="button" className="text-button" onClick={() => camera.current?.click()}><Icon name="camera" size={15} /> Prendre une photo</button>
        <button type="button" className="text-button" onClick={() => gallery.current?.click()}><Icon name="image" size={15} /> Depuis la galerie</button>
        {image && <button type="button" className="text-button" onClick={() => corrections.saveImage(key, null)}>Retirer la photo</button>}
      </div>
      <input ref={camera} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} className="hidden-input" type="file" accept="image/*" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />

      <button type="button" className="text-button" onClick={onShare}><Icon name="share" size={15} /> Partager cet ingrédient</button>
      <button type="button" className="text-button danger-text" onClick={() => { corrections.removePantry(item.pantryId); flash(`« ${item.name} » retiré de mes ingrédients`); onClose(); }}>Retirer de mes ingrédients</button>
    </div>
  );
}

/** Onglet « Mes ingrédients » du carnet : la liste rapide de produits à réutiliser. */
export default function PantryPanel({ flash }: PantryPanelProps) {
  const corrections = useCorrections();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [sharing, setSharing] = useState<SharePayload | null>(null);
  if (!corrections) return null;
  const { pantry } = corrections;

  return (
    <section className="pantry">
      {adding ? (
        <FoodPicker onPick={(food) => {
          const item = toPantry(toMealItem(food));
          if (pantry.some((entry) => correctionKey(entry) === correctionKey(item))) { flash(`« ${item.name} » est déjà dans tes ingrédients`); return; }
          corrections.savePantry(item);
          setOpenId(item.pantryId);
          setAdding(false);
          flash(`« ${item.name} » ajouté : choisis comment tu l'utilises`);
        }}>
          <button type="button" className="text-button" onClick={() => setAdding(false)}>Annuler</button>
        </FoodPicker>
      ) : (
        <button type="button" className="create-recipe" onClick={() => setAdding(true)}>
          <span><Icon name="plus" /></span>
          <div><strong>Ajouter un ingrédient</strong><small>Scan du code-barres, recherche ou photo du paquet</small></div>
          <Icon name="chevron" size={18} />
        </button>
      )}
      <p className="theme-description">Les produits que tu achètes souvent, avec leur photo et comment les compter (tranche, paquet, grammes). Rien n'est ajouté à tes repas : tu les retrouves en un geste dans « Ajouter un repas » et dans les recettes.</p>
      {sharing && <ShareSheet payload={sharing} onClose={() => setSharing(null)} />}
      {pantry.length > 1 && !sharing && <button type="button" className="text-button" onClick={() => setSharing(ingredientsPayload(pantry))}><Icon name="share" size={15} /> Partager toute ma liste ({pantry.length})</button>}
      {pantry.length === 0 && !adding && <p className="food-hint">Ta liste est vide : scanne ton premier produit.</p>}
      <div className="food-results">
        {pantry.map((item) => (
          <div key={item.pantryId} className="pantry-row">
            <FoodResultRow result={pantryResult(item)} onPick={() => setOpenId(openId === item.pantryId ? null : item.pantryId)} />
            {openId === item.pantryId && <PantryEditor item={item} onClose={() => setOpenId(null)} onShare={() => { setSharing(ingredientsPayload([item])); setOpenId(null); }} flash={flash} />}
          </div>
        ))}
      </div>
    </section>
  );
}

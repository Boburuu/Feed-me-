import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { cleanProductCode, cropImage, readPrintedCodes, readProductCodes, type CropRect } from "../lib/barcodeImage";
import FoodResultRow from "./FoodResultRow";
import { liveScanAvailable, packagingFromPhoto, scanBarcode } from "../lib/foodPhoto";
import { openFoodFactsByBarcode, type FoodResult } from "../lib/foods";

type BarcodePanelProps = {
  onFound: (food: FoodResult) => void;
  onClose: () => void;
  /** Produit absent d'Open Food Facts : le chercher par son nom, ou le créer. */
  onSearchByName: () => void;
  onCreate?: (code: string) => void;
};

type State =
  | { step: "menu" }
  | { step: "reading"; message: string }
  | { step: "crop"; file: File; src: string; message: string }
  | { step: "packaging"; file: File; results: FoodResult[] }
  | { step: "choose"; codes: string[] }
  | { step: "manual"; error?: string }
  | { step: "missing"; code: string };

const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.3, width: 0.8, height: 0.4 };

/**
 * Code-barres d'un produit : caméra, photo de la galerie (avec recadrage si la lecture
 * échoue) ou chiffres tapés à la main. Le produit est cherché dans Open Food Facts ; la
 * quantité mangée se règle ensuite, le scan ne la connaît pas.
 */
export default function BarcodePanel({ onFound, onClose, onSearchByName, onCreate }: BarcodePanelProps) {
  const [state, setState] = useState<State>({ step: "menu" });
  const [typed, setTyped] = useState("");
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cropArea = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => { if (state.step === "crop") URL.revokeObjectURL(state.src); }, [state]);

  const lookup = async (code: string) => {
    setState({ step: "reading", message: `Recherche du produit ${code}…` });
    try {
      const food = await openFoodFactsByBarcode(code);
      if (food) onFound(food);
      else setState({ step: "missing", code });
    } catch {
      setState({ step: "manual", error: navigator.onLine ? "Open Food Facts ne répond pas : réessayez dans un instant." : "Hors connexion : il faut internet pour trouver le produit." });
    }
  };

  const toCrop = (file: File, message = "Code-barres introuvable sur la photo. Entourez-le avec le doigt, puis « Lire cette zone ».") => {
    setCrop(DEFAULT_CROP);
    setState({ step: "crop", file, src: URL.createObjectURL(file), message });
  };

  const handleCodes = async (codes: string[], file: File | null, retry: boolean) => {
    if (codes.length === 1) return void lookup(codes[0]);
    if (codes.length > 1) return setState({ step: "choose", codes });
    if (file && !retry) {
      // Pas de code-barres : photo du devant du paquet ? On lit la marque et le nom imprimés.
      setState({ step: "reading", message: "Pas de code-barres : lecture du nom sur l'emballage…" });
      const results = await packagingFromPhoto(file).catch(() => []);
      if (results.length) return setState({ step: "packaging", file, results });
      return toCrop(file, "Ni code-barres ni nom de produit reconnus. Si le code-barres est sur la photo, entourez-le avec le doigt, puis « Lire cette zone ».");
    }
    setState({ step: "manual", error: "Toujours illisible : tapez les chiffres écrits sous les barres." });
  };

  /** Barres illisibles : on lit les chiffres imprimés dessous. */
  const withPrintedDigits = async (image: Blob, codes: string[]) => {
    if (codes.length) return codes;
    setState({ step: "reading", message: "Barres illisibles : lecture des chiffres…" });
    return readPrintedCodes(image).catch(() => []);
  };

  const readFile = async (file: File) => {
    setState({ step: "reading", message: "Lecture du code-barres…" });
    await handleCodes(await withPrintedDigits(file, await readProductCodes(file).catch(() => [])), file, false);
  };

  const readCrop = async () => {
    if (state.step !== "crop") return;
    const file = state.file;
    setState({ step: "reading", message: "Lecture de la zone…" });
    const zone = await cropImage(file, crop).catch(() => null);
    await handleCodes(zone ? await withPrintedDigits(zone, await readProductCodes(zone).catch(() => [])) : [], file, true);
  };

  const camera = async () => {
    // Navigateur (iPhone) : pas de scanner en direct, la caméra prend une photo.
    if (!liveScanAvailable()) return cameraInput.current?.click();
    try {
      const result = await scanBarcode();
      if (result.status === "found") onFound(result.food);
      else if (result.status === "unknown") setState({ step: "missing", code: result.code });
      else if (result.status === "installing") setState({ step: "reading", message: "Installation du scanner par Android… Réessayez dans quelques secondes." });
    } catch {
      setState({ step: "manual", error: "Le scan n'a pas abouti. Tapez les chiffres, ou réessayez bien éclairé." });
    }
  };

  // Recadrage : rectangle tracé avec le doigt, en fractions de l'image.
  const point = (event: React.PointerEvent) => {
    const box = cropArea.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
  };
  const onPointerDown = (event: React.PointerEvent) => { (event.target as Element).setPointerCapture?.(event.pointerId); dragStart.current = point(event); };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragStart.current) return;
    const start = dragStart.current;
    const end = point(event);
    setCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(0.05, Math.abs(end.x - start.x)), height: Math.max(0.05, Math.abs(end.y - start.y)) });
  };

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, capture: boolean) => (
    <input ref={ref} className="hidden-input" type="file" accept="image/*" {...(capture ? { capture: "environment" as const } : {})}
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void readFile(file); }} />
  );

  return (
    <section className="barcode-panel">
      <div className="barcode-head">
        <strong>Code-barres du produit</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={15} /></button>
      </div>

      {state.step === "menu" && (
        <>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={() => void camera()}><Icon name="camera" size={16} /> Scanner avec la caméra</button>
            {liveScanAvailable() && <button type="button" className="add-part" onClick={() => cameraInput.current?.click()}><Icon name="camera" size={16} /> Photographier le paquet (devant ou code-barres)</button>}
            <button type="button" className="add-part" onClick={() => galleryInput.current?.click()}><Icon name="image" size={16} /> Importer une photo de la galerie</button>
            <button type="button" className="add-part" onClick={() => setState({ step: "manual" })}><Icon name="edit" size={16} /> Saisir les chiffres</button>
          </div>
          <small className="barcode-hint">Sur une photo, le code-barres est lu s'il est net et entier ; sinon, le nom imprimé sur le paquet (marque, produit) sert à le chercher. Un QR code (carré de points) n'est pas un code-barres de produit.</small>
        </>
      )}

      {state.step === "reading" && <p className="food-hint"><span className="loader" /> {state.message}</p>}

      {state.step === "crop" && (
        <>
          <p className="food-hint">{state.message}</p>
          <div className="crop-area" ref={cropArea} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragStart.current = null; }}>
            <img src={state.src} alt="Photo à recadrer" draggable={false} />
            <span className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
          </div>
          <div className="barcode-actions">
            <button type="button" className="text-button" onClick={() => setState({ step: "manual" })}>Saisir les chiffres</button>
            <button type="button" className="plan-confirm" onClick={() => void readCrop()}><Icon name="check" size={14} /> Lire cette zone</button>
          </div>
        </>
      )}

      {state.step === "packaging" && (
        <>
          <p className="food-hint">Pas de code-barres sur la photo. D'après le nom imprimé sur l'emballage, c'est peut-être :</p>
          <div className="food-results">
            {state.results.map((food) => <FoodResultRow key={food.ref ?? food.name} result={food} onPick={onFound} />)}
          </div>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={onSearchByName}><Icon name="apple" size={16} /> Aucun ne correspond : chercher par le nom</button>
            <button type="button" className="add-part" onClick={() => toCrop(state.file)}><Icon name="barcode" size={16} /> Entourer le code-barres sur la photo</button>
          </div>
        </>
      )}

      {state.step === "choose" && (
        <>
          <p className="food-hint">Plusieurs codes-barres sur la photo : lequel ?</p>
          {state.codes.map((code) => <button type="button" className="food-result" key={code} onClick={() => void lookup(code)}><span className="food-result-text"><strong>{code}</strong></span><Icon name="chevron" size={16} /></button>)}
        </>
      )}

      {state.step === "manual" && (
        <form className="barcode-manual" onSubmit={(e) => { e.preventDefault(); const code = cleanProductCode(typed); if (code) void lookup(code); else setState({ step: "manual", error: "Code invalide : il faut les 8 ou 13 chiffres écrits sous les barres. Vérifiez qu'il n'en manque pas." }); }}>
          {state.error && <p className="food-hint">{state.error}</p>}
          <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="Chiffres sous les barres" aria-label="Chiffres du code-barres" autoFocus />
          <button type="submit" className="plan-confirm"><Icon name="check" size={14} /> Chercher</button>
        </form>
      )}

      {state.step === "missing" && (
        <>
          <p className="food-hint">Le code {state.code} n'est pas dans Open Food Facts.</p>
          <div className="barcode-choices">
            <button type="button" className="add-part" onClick={onSearchByName}><Icon name="apple" size={16} /> Chercher le produit par son nom</button>
            {onCreate && <button type="button" className="add-part" onClick={() => onCreate(state.code)}><Icon name="plus" size={16} /> Créer ce produit (valeurs de l'étiquette)</button>}
          </div>
        </>
      )}

      {fileInput(cameraInput, true)}
      {fileInput(galleryInput, false)}
    </section>
  );
}

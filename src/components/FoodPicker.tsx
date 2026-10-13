import { useEffect, useRef, useState } from "react";
import FoodResultRow from "./FoodResultRow";
import Icon from "./Icon";
import { normalize, searchCiqual, searchCommon, searchOpenFoodFacts, type FoodResult } from "../lib/foods";
import { analyzeMealPhoto, photoRecognitionAvailable, scanBarcode, type PhotoAnalysis } from "../lib/foodPhoto";

type FoodPickerProps = {
  onPick: (food: FoodResult) => void;
  /** Affiché sous la recherche quand on ne cherche pas (les aliments déjà choisis). */
  children?: React.ReactNode;
};

/**
 * Trouver un aliment avec ses valeurs nutritionnelles : recherche (Ciqual, puis
 * Open Food Facts), photo du produit ou scan du code-barres.
 */
export default function FoodPicker({ onPick: pick, children }: FoodPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [brands, setBrands] = useState<FoodResult[] | null>(null);
  const [brandState, setBrandState] = useState<"idle" | "loading" | "error">("idle");
  const [photo, setPhoto] = useState<{ src: string; state: "loading" | "done" | "error"; analysis: PhotoAnalysis | null } | null>(null);
  const [note, setNote] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const native = photoRecognitionAvailable();
  /** Aliment choisi : la recherche se vide pour revoir la liste, comme dans un repas. */
  const onPick = (food: FoodResult) => { setQuery(""); setPhoto(null); pick(food); };

  // Aliments courants sous leur nom simple, puis les autres lignes de Ciqual.
  useEffect(() => {
    let alive = true;
    setBrands(null);
    Promise.all([searchCommon(query, 3), searchCiqual(query, 6)])
      .then(([simple, all]) => {
        if (!alive) return;
        const shown = new Set(simple.map((item) => item.ref?.split(":")[0]));
        setResults([...simple, ...all.filter((item) => !shown.has(item.ref))].slice(0, 6));
      })
      .catch(() => { if (alive) setResults([]); });
    return () => { alive = false; };
  }, [query]);

  const showBrands = () => {
    setBrandState("loading");
    searchOpenFoodFacts(query)
      .then((found) => { setBrands(found.slice(0, 6)); setBrandState("idle"); })
      .catch(() => setBrandState("error"));
  };

  const analyzePhoto = (file: File) => {
    setNote("");
    setPhoto({ src: URL.createObjectURL(file), state: "loading", analysis: null });
    analyzeMealPhoto(file)
      .then((analysis) => setPhoto((current) => current && { ...current, state: "done", analysis }))
      .catch(() => setPhoto((current) => current && { ...current, state: "error" }));
  };

  const scan = async () => {
    setNote("");
    try {
      const result = await scanBarcode();
      if (result.status === "found") onPick(result.food);
      else if (result.status === "unknown") setNote(`Code ${result.code} inconnu d'Open Food Facts : cherchez le produit par son nom.`);
      else if (result.status === "installing") setNote("Installation du scanner par Android… Réessayez dans quelques secondes.");
    } catch {
      setNote(navigator.onLine ? "Le scan n'a pas abouti. Réessayez, bien éclairé." : "Hors connexion : le scan a besoin d'internet.");
    }
  };

  const analysis = photo?.analysis;
  const photoFoods = analysis ? [...(analysis.barcode ? [analysis.barcode] : []), ...analysis.packaging, ...analysis.dishes.map((dish) => dish.food)] : [];

  return (
    <div className="food-picker">
      <div className="food-search">
        <Icon name="apple" size={18} />
        <input
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ajouter un ingrédient : farine, jambon…"
          aria-label="Rechercher un ingrédient"
        />
      </div>

      {native && !query.trim() && !photo && (
        <div className="capture-actions">
          <button type="button" className="add-part" onClick={() => photoInput.current?.click()}><Icon name="camera" size={16} /> Photo</button>
          <button type="button" className="add-part" onClick={scan}><Icon name="target" size={16} /> Code-barres</button>
        </div>
      )}
      <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) analyzePhoto(file); }} />
      {note && <p className="food-hint">{note}</p>}

      {photo && !query.trim() && (
        <section className="photo-analysis">
          <div className="photo-analysis-head">
            <img src={photo.src} alt="Photo de l'ingrédient" />
            <div>
              <strong>{photo.state === "loading" ? "Analyse de la photo…" : photo.state === "error" ? "Analyse impossible" : photoFoods.length ? "Quel produit ?" : "Rien de reconnu"}</strong>
              <small>{photo.state === "loading" ? "Code-barres, emballage, puis aliment." : photoFoods.length ? "Touchez le bon." : "Essayez le code-barres, ou cherchez-le ci-dessus."}</small>
            </div>
            {photo.state === "loading"
              ? <span className="loader" />
              : <button type="button" className="icon-button" onClick={() => setPhoto(null)} aria-label="Fermer l'analyse"><Icon name="close" size={16} /></button>}
          </div>
          {photoFoods.map((food, index) => <FoodResultRow key={`photo-${index}`} result={food} onPick={onPick} />)}
        </section>
      )}

      {query.trim() && (
        <div className="food-results">
          {results.map((food, index) => <FoodResultRow key={`${food.ref ?? food.name}-${index}`} result={food} onPick={onPick} />)}
          {!results.length && normalize(query).length < 3 && <p className="food-hint">Continuez à taper…</p>}
          {normalize(query).length >= 3 && brands === null && brandState !== "loading" && (
            <button type="button" className="add-part" onClick={showBrands} disabled={!navigator.onLine}>
              <Icon name="target" size={15} /> {navigator.onLine ? "Voir les produits de marque" : "Hors connexion : pas de produits de marque"}
            </button>
          )}
          {brandState === "loading" && <p className="food-hint"><span className="loader" /> Recherche…</p>}
          {brandState === "error" && <p className="food-hint">Open Food Facts ne répond pas pour le moment.</p>}
          {brands !== null && (
            <>
              <p className="food-section">Produits de marque · Open Food Facts</p>
              {brands.length ? brands.map((food, index) => <FoodResultRow key={`off-${food.ref ?? index}`} result={food} onPick={onPick} />) : <p className="food-hint">Aucun produit trouvé.</p>}
            </>
          )}
        </div>
      )}

      {/* Pendant la recherche : uniquement les résultats, rien ne se superpose. */}
      {!query.trim() && children}
    </div>
  );
}

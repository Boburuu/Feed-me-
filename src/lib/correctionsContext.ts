import { createContext, useContext } from "react";
import type { CookPref, CookPrefs } from "./cooking";
import type { Corrections, ProductCorrection } from "./corrections";
import type { PantryItem } from "./pantry";

export type CorrectionsApi = {
  corrections: Corrections;
  /** Garde la correction ; recountPast : recalculer aussi les repas déjà notés. */
  save: (key: string, correction: ProductCorrection, recountPast: boolean) => void;
  /** Nombre de repas déjà notés que la correction changerait. */
  pastMeals: (key: string, correction: ProductCorrection) => number;
  /** Cru / cuit, sec / cuit retenu par aliment (cookKey). */
  cookPrefs: CookPrefs;
  saveCookPref: (key: string, pref: CookPref) => void;
  /** Photos de produits ajoutées à la main (clé : correctionKey). */
  images: Record<string, string>;
  saveImage: (key: string, image: string | null) => void;
  /** « Mes ingrédients » : la liste et son enregistrement. */
  pantry: PantryItem[];
  savePantry: (item: PantryItem) => void;
  removePantry: (id: number) => void;
};

/** Fourni par l'écran principal ; absent (null) hors de l'app, la vérification est alors masquée. */
export const CorrectionsContext = createContext<CorrectionsApi | null>(null);

export const useCorrections = () => useContext(CorrectionsContext);

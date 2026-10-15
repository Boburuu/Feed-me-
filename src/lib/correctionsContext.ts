import { createContext, useContext } from "react";
import type { CookPref, CookPrefs } from "./cooking";
import type { Corrections, ProductCorrection } from "./corrections";

export type CorrectionsApi = {
  corrections: Corrections;
  /** Garde la correction ; recountPast : recalculer aussi les repas déjà notés. */
  save: (key: string, correction: ProductCorrection, recountPast: boolean) => void;
  /** Nombre de repas déjà notés que la correction changerait. */
  pastMeals: (key: string, correction: ProductCorrection) => number;
  /** Cru / cuit, sec / cuit retenu par aliment (cookKey). */
  cookPrefs: CookPrefs;
  saveCookPref: (key: string, pref: CookPref) => void;
};

/** Fourni par l'écran principal ; absent (null) hors de l'app, la vérification est alors masquée. */
export const CorrectionsContext = createContext<CorrectionsApi | null>(null);

export const useCorrections = () => useContext(CorrectionsContext);

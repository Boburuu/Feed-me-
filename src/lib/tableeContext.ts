import { createContext, useContext } from "react";

export type TableeApi = {
  /** Prénom affiché aux autres dans les partages. */
  myName: string;
  /** Prénom et pseudo : pour se reconnaître parmi les invités d'un partage reçu. */
  me: string[];
  tablee: string[];
  addToTablee: (names: string[]) => void;
  removeFromTablee: (name: string) => void;
  /** Partages déjà ouverts et ajoutés. */
  received: string[];
  markReceived: (id: string) => void;
};

/** Fourni par l'écran principal ; absent (null) hors de l'app : pas de tablée proposée. */
export const TableeContext = createContext<TableeApi | null>(null);

export const useTablee = () => useContext(TableeContext);

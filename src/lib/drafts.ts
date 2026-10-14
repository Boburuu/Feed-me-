// Brouillons : un repas ou une recette en cours de saisie survit à un changement d'application.
//
// Android peut fermer l'app en arrière-plan (pour libérer de la mémoire) : sans brouillon,
// une assiette commencée est perdue. Chaque saisie est enregistrée tout de suite dans le
// téléphone ; à la réouverture, la fenêtre se rouvre avec le travail en cours.

import type { MealCategory, MealItem, RecipeCategory, StepGroup } from "./storage";

/** Au-delà de 24 h, un brouillon oublié n'est plus proposé. */
const MAX_AGE_MS = 24 * 3_600_000;

export type Stored<T> = T & { savedAt: number; open: boolean };

function read<T>(key: string): Stored<T> | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Stored<T> | null;
    return value && Date.now() - value.savedAt < MAX_AGE_MS ? value : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T, open: boolean) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, savedAt: Date.now(), open }));
  } catch {
    // Stockage plein : le brouillon est perdu, pas les données.
  }
}

function remove(key: string) {
  try { localStorage.removeItem(key); } catch { /* rien à faire */ }
}

// --- Repas en cours ----------------------------------------------------------------------------

export type MealDraft = {
  /** Repas déjà noté en cours de modification. */
  editingId?: number;
  date: string;
  category: MealCategory;
  mode: "meal" | "plate";
  lines: MealItem[];
  plateName: string;
  servings: number;
  parts: number;
  adjust: number;
  keepLeftover: boolean;
  query: string;
  /** Repas prévu, pas encore mangé. */
  planned?: boolean;
};

const MEAL_KEY = "feedme:brouillon-repas";
export const mealDraft = {
  load: () => read<MealDraft>(MEAL_KEY),
  save: (draft: MealDraft, open: boolean) => write(MEAL_KEY, draft, open),
  /** La fenêtre est fermée : le brouillon reste proposé à la prochaine ouverture. */
  close: () => { const draft = read<MealDraft>(MEAL_KEY); if (draft) write(MEAL_KEY, draft, false); },
  clear: () => remove(MEAL_KEY),
};

/** Un brouillon qui vaut la peine d'être repris (au moins un aliment, ou un nom d'assiette). */
export const hasContent = (draft: MealDraft | null) => !!draft && (draft.lines.length > 0 || !!draft.plateName.trim());

// --- Recette en cours ----------------------------------------------------------------------------

/** Champs du formulaire de recette (les photos ajoutées ne sont pas gardées : trop lourdes). */
export type RecipeDraftForm = {
  name: string;
  category: RecipeCategory;
  ingredients: { title: string; items: { key: number; quantity: string; unit: string; name: string; food?: MealItem }[] }[];
  steps: StepGroup[];
  time: string;
  portions: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  volume: string;
  notes: string;
  url: string;
};

export type RecipeDraft = {
  /** Recette déjà enregistrée en cours de modification. */
  recipeId?: number;
  form: RecipeDraftForm;
  rawText: string | null;
};

const RECIPE_KEY = "feedme:brouillon-recette";
/** Une recette commencée : un nom, un ingrédient, une étape ou un texte collé. */
const recipeHasContent = (draft: RecipeDraft | null) => !!draft && (!!draft.form.name.trim() || !!draft.rawText?.trim()
  || draft.form.ingredients.some((group) => group.items.some((item) => item.food || item.name.trim()))
  || draft.form.steps.some((group) => group.steps.some((step) => step.text.trim())));
export const recipeDraft = {
  load: () => { const draft = read<RecipeDraft>(RECIPE_KEY); return recipeHasContent(draft) ? draft : null; },
  save: (draft: RecipeDraft) => write(RECIPE_KEY, draft, true),
  clear: () => remove(RECIPE_KEY),
};

// --- Onglet ouvert ---------------------------------------------------------------------------------

const TAB_KEY = "feedme:onglet";
export const lastTab = {
  load: () => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } },
  save: (tab: string) => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* rien */ } },
};


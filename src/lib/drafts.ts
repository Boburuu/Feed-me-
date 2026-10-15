// Brouillons : un repas ou une recette en cours de saisie survit à un changement d'application.
//
// Android peut fermer l'app en arrière-plan (pour libérer de la mémoire) : sans brouillon,
// une assiette commencée est perdue. Chaque saisie est enregistrée tout de suite dans le
// téléphone ; à la réouverture, la fenêtre se rouvre avec le travail en cours.

import type { MealCategory, MealItem, RecipeCategory, StepGroup } from "./storage";

/** Au-delà de cette durée (24 h par défaut, réglable dans le profil), un brouillon oublié n'est plus proposé. */
export const DRAFT_HOURS = [12, 24, 48, 72, 168] as const;
let maxAgeMs = 24 * 3_600_000;
export const setDraftHours = (hours: number | undefined) => { maxAgeMs = (hours && hours > 0 ? hours : 24) * 3_600_000; };

export type Stored<T> = T & { savedAt: number; open: boolean };

function read<T>(key: string): Stored<T> | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Stored<T> | null;
    return value && Date.now() - value.savedAt < maxAgeMs ? value : null;
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

// Un brouillon par moment de repas : le dîner commencé ne remplace pas le petit-déjeuner
// laissé en plan. La modification d'un repas déjà noté a sa propre place, et l'ancienne
// clé unique (avant cette séparation) est encore lue.
const LEGACY_MEAL_KEY = "feedme:brouillon-repas";
type Slot = MealCategory | "modification";
const SLOTS: Slot[] = ["petit-dejeuner", "dejeuner", "diner", "collation", "modification"];
const slotKey = (slot: Slot) => `${LEGACY_MEAL_KEY}:${slot}`;
const slotOf = (draft: Pick<MealDraft, "category" | "editingId">): Slot => (draft.editingId ? "modification" : draft.category);
/** Place du brouillon en cours de saisie (il suit le repas si on change de moment). */
let current: Slot | null = null;

function allMealDrafts() {
  const drafts = SLOTS.map((slot) => read<MealDraft>(slotKey(slot))).filter((draft): draft is Stored<MealDraft> => !!draft);
  const legacy = read<MealDraft>(LEGACY_MEAL_KEY);
  if (legacy && !drafts.some((draft) => slotOf(draft) === slotOf(legacy))) drafts.push(legacy);
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export const mealDraft = {
  /** Le brouillon d'un nouveau repas de ce moment ; sans moment : le plus récent (modification comprise). */
  load: (category?: MealCategory) => {
    const drafts = allMealDrafts();
    return (category ? drafts.find((draft) => !draft.editingId && draft.category === category) : drafts[0]) ?? null;
  },
  /** Brouillon de la modification d'un repas déjà noté. */
  loadEditing: (mealId: number) => allMealDrafts().find((draft) => draft.editingId === mealId) ?? null,
  /** Tous les brouillons encore valables, du plus récent au plus ancien. */
  all: () => allMealDrafts(),
  save: (draft: MealDraft, open: boolean) => {
    const slot = slotOf(draft);
    // Le moment a changé pendant la saisie : le brouillon déménage.
    if (current && current !== slot) remove(slotKey(current));
    remove(LEGACY_MEAL_KEY);
    current = slot;
    write(slotKey(slot), draft, open);
  },
  /** La fenêtre est fermée : le brouillon reste proposé à la prochaine ouverture. */
  close: () => {
    for (const key of [...(current ? [slotKey(current)] : []), LEGACY_MEAL_KEY]) {
      const draft = read<MealDraft>(key);
      if (draft) write(key, draft, false);
    }
    current = null;
  },
  /** Oublie le brouillon en cours de saisie (jamais ceux des autres moments). */
  clear: () => {
    if (current) remove(slotKey(current));
    remove(LEGACY_MEAL_KEY);
    current = null;
  },
  /** « Abandonner » un brouillon proposé : il est supprimé de sa place. */
  discard: (draft: MealDraft) => { remove(slotKey(slotOf(draft))); if (current === slotOf(draft)) current = null; },
  /** Reprend un brouillon : ses changements suivants restent à sa place. */
  resume: (draft: MealDraft) => { current = slotOf(draft); },
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


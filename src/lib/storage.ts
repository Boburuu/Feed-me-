// Toutes les données de l'app vivent dans une seule clé localStorage,
// ce qui rend l'export / import de sauvegarde trivial. Seules les images des
// recettes, trop lourdes, sont rangées à part dans IndexedDB (voir images.ts).

import { programFor } from "./goals";
import { legacyActivity } from "./nutrition";
import { ingredientLines, legacyEstimate, parseIngredientLine } from "./recipes";

export const STORAGE_KEY = "feedme:data";
export const PIN_LENGTH = 4;

export type Sex = "femme" | "homme";
export type ThemeName = "sauge" | "nuit" | "ocean" | "lavande" | "eshin" | "sororitas";

/** Thèmes remplacés : Terracotta → Adepta Sororitas, Minuit → Clan Eshin. */
const legacyThemes: Record<string, ThemeName> = { terracotta: "sororitas", minuit: "eshin" };
export type MealCategory = "petit-dejeuner" | "dejeuner" | "diner" | "collation";
export type SourceType = "manual" | "photo" | "recipe";
export type GoalType = "perte" | "maintien" | "prise";
export type ProgramId = "equilibre" | "jeune" | "seche" | "masse";
export type RecipeCategory = "petit-dejeuner" | "apero" | "entree" | "plat" | "dessert" | "gouter" | "boisson";

export type Profile = {
  lastName: string;
  firstName: string;
  pseudo: string;
  age: number;
  sex: Sex;
  height: number;
  weight: number;
  activity: string;
  photo: string | null;
  createdAt: string;
};

export type Meal = {
  id: number;
  date: string;
  category: MealCategory;
  name: string;
  calories: number;
  protein?: number;
  /** Glucides du repas, en g (absents des repas notés avant leur suivi). */
  carbs?: number;
  /** Lipides du repas, en g (absents des repas notés avant leur suivi). */
  fat?: number;
  /**
   * Ses boissons comptent dans l'hydratation (repas notés depuis cette fonction ; les plus
   * anciens n'y comptent pas, pour ne pas doubler les verres ajoutés à la main).
   */
  drinksCounted?: boolean;
  /** « planned » : repas prévu, pas encore mangé (compté nulle part tant qu'il n'est pas confirmé). */
  status?: "planned";
  source: SourceType;
  /** Détail des aliments, pour les repas composés avec la recherche. */
  items?: MealItem[];
  /** Assiette maison : plat préparé pour plusieurs, dont on a mangé une part (items = plat entier). */
  plate?: { servings: number; share: number };
  /** Repas libre (chez quelqu'un, cheat meal) : calories inconnues, le jour sort des statistiques. */
  free?: boolean;
  /** Estimation facultative d'un repas libre, affichée « ≈ » mais comptée nulle part. */
  freeEstimate?: number;
};

/** Part restante d'une assiette maison, proposée aux repas suivants (4 jours au frigo). */
export type Leftover = {
  id: number;
  name: string;
  /** Jour de préparation (AAAA-MM-JJ). */
  date: string;
  partsLeft: number;
  kcalPerPart: number;
  proteinPerPart: number;
  carbsPerPart?: number;
  fatPerPart?: number;
};

/** D'où viennent les valeurs nutritionnelles d'un aliment. */
/** « enseigne » : carte officielle d'un fast-food (voir fastFood/). */
export type FoodSource = "ciqual" | "off" | "recette" | "perso" | "enseigne";

/**
 * Un aliment du repas. Les valeurs sont pour 100 g (unité « g ») ou pour une
 * portion (unité « portion »), comme sur les emballages.
 */
export type MealItem = {
  name: string;
  source: FoodSource;
  /** Code Ciqual, code-barres, id de recette ou d'aliment perso. */
  ref?: string;
  quantity: number;
  unit: "g" | "portion";
  kcal100: number;
  protein100: number | null;
  /** Glucides, comme kcal100 : pour 100 g, ou pour une portion. Absent : inconnu. */
  carbs100?: number | null;
  /** Lipides, comme kcal100. Absent : pas encore lu ; null : inconnu. */
  fat100?: number | null;
  /** Sucres, AG saturés, fibres et sel, comme kcal100 (absents : inconnus). */
  sugars100?: number | null;
  satFat100?: number | null;
  fiber100?: number | null;
  salt100?: number | null;
  /**
   * Féculent vendu sec (riz, pâtes…) : rapport poids cuit / poids sec. Avec weighedCooked,
   * les grammes saisis sont des grammes cuits, convertis en sec pour le calcul.
   */
  cookedFactor?: number;
  weighedCooked?: boolean;
  /** D'où vient le facteur sec → cuit : l'emballage (valeurs « préparé ») ou Ciqual. */
  cookedBy?: "emballage";
  /**
   * Hydratation : true = compté comme boisson même s'il n'est pas liquide (soupe), false =
   * jamais compté. Absent : compté seulement si c'est une boisson (liquid).
   */
  hydrates?: boolean;
  /**
   * Produit qu'on prépare avec de l'eau (sachet de thé, café soluble, sirop…) : volume de la
   * boisson préparée, en ml, compté dans l'hydratation (les calories restent celles du produit).
   */
  waterMl?: number;
  /** Liquide dont la fiche est pour 100 g : grammes par ml (absent : 1). */
  density?: number;
  /** Boisson en volume : unité de saisie choisie (la quantité reste en ml). */
  volumeUnit?: "ml" | "cl" | "dl" | "L";
  /** Préparation de boisson selon Open Food Facts (thé, café, sirop) : se prépare avec de l'eau. */
  prepared?: boolean;
  /** Part d'une recette dont le volume final est connu : ml bus par part. */
  drinkMlPerPart?: number;
  /** Valeur habituelle (Ciqual) pour ce type d'aliment, pour signaler une fiche douteuse. */
  refKcal100?: number;
  refName?: string;
  /** Poids d'une portion, quand on le connaît (« 1 barre = 23,5 g »). */
  portionGrams?: number;
  portionLabel?: string;
  /** Boisson : quantités affichées en ml (1 ml ≈ 1 g). */
  liquid?: boolean;
  /** Contenance du paquet ou de la boîte (« 850 g »), pour « ½ boîte ». */
  packageGrams?: number;
  /** Portion d'origine (« 1 barre »), gardée quand on passe à la boîte ou aux grammes. */
  servingGrams?: number;
  servingLabel?: string;
  /** Paquet vendu à la pièce (« 10 tranches », « 4 feuilles ») : poids d'une pièce. */
  pieceGrams?: number;
  pieceLabel?: string;
  /** Ingrédient écrit retrouvé automatiquement : nom de l'aliment retenu dans la base. */
  matchedName?: string;
  /** Ingrédient « au choix » (« crevettes ou poulet ») : le choix compté. */
  choice?: string;
  /** Recette du carnet : nombre de parts de la recette entière (valeurs = 1 part). */
  recipePortions?: number;
  /** Recette du carnet : nombre de morceaux du plat entier (« j'en ai mangé 2 »). */
  recipePieces?: number;
  /** Recette du carnet : poids du plat entier en g (« j'en ai mangé 250 g »). */
  recipeGrams?: number;
  /** Recette du carnet : unité choisie pour la quantité (gardée en parts). */
  recipeCount?: "parts" | "pieces" | "grams";
  /** Poids du plat estimé d'après les ingrédients (pas pesé) : à corriger si le plat a cuit. */
  recipeGramsEstimated?: boolean;
  /** Valeurs remplacées par la correction locale du produit (étiquette). */
  corrected?: boolean;
  /** Fiche comparée à l'étiquette et trouvée juste. */
  labelChecked?: boolean;
};

export type StepEntry = { count: number; source: "manuel" | "auto"; updatedAt: string };
export type StepsSource = "phone" | "health" | null;

/** Aliment créé par l'utilisateur, réutilisable dans ses repas. */
export type CustomFood = {
  id: number;
  name: string;
  kcal100: number;
  protein100: number | null;
  carbs100?: number | null;
  fat100?: number | null;
  portionGrams?: number;
  portionLabel?: string;
};

export type WeightEntry = { id: number; date: string; kg: number };
export type SportTask = { id: number; label: string; detail: string; done: boolean };
/** « 200 g de farine » → { quantity: 200, unit: "g", name: "farine" }. Quantité nulle : « Sel, poivre ». */
/**
 * `food` : ingrédient choisi dans Ciqual ou Open Food Facts (comme dans un repas), avec
 * sa quantité exacte ; il sert à calculer les calories de la recette.
 */
export type Ingredient = { name: string; quantity: number | null; unit: string; food?: MealItem };
/** Une partie de la recette (« Pâte », « Garniture »…). Titre vide : partie unique. */
export type IngredientGroup = { title: string; items: Ingredient[] };
export type RecipeStep = { title: string; text: string };
export type StepGroup = { title: string; steps: RecipeStep[] };

export type Recipe = {
  id: number;
  name: string;
  ingredients: IngredientGroup[];
  steps: StepGroup[];
  time: number;
  portions: number;
  calories: number;
  protein: number;
  /** Glucides par personne, en g (absents : pas encore calculés). */
  carbs?: number;
  /** Lipides par personne, en g (absents : pas encore calculés). */
  fat?: number;
  /** Volume final préparé, en ml (boisson, soupe) : compté dans l'hydratation selon la part bue. */
  volumeMl?: number;
  /** Nombre de morceaux du plat (gâteau coupé en 12), retenu pour « j'en ai mangé 2 ». */
  pieces?: number;
  /** Poids du plat entier en g, retenu pour « j'en ai mangé 250 g ». */
  totalGrams?: number;
  /** Absente des recettes créées avant les catégories : « plat » par défaut. */
  category?: RecipeCategory;
  /** Identifiants des images (captures, photo du site) rangées dans IndexedDB. */
  images?: string[];
  url?: string;
  notes?: string;
  /** Valeurs saisies à la main (étiquette, site) : pas recalculées d'après les ingrédients. */
  nutritionManual?: boolean;
};

export type Plan = {
  goal: GoalType;
  program: ProgramId;
  /** Poids à atteindre (perte ou prise), en kg. */
  targetWeight: number | null;
  /** Rythme visé, en kg par semaine. */
  pace: number;
  startWeight: number;
  startDate: string;
  /** Besoin d'entretien mesuré sur les repas et pesées, quand l'utilisateur l'adopte. */
  customMaintenance: number | null;
};

export type SessionType = "marche" | "course" | "velo" | "natation" | "muscu" | "yoga" | "danse" | "autre";

/** Une séance d'activité physique. Une séance intense compte double (repère OMS). */
export type Session = { id: number; date: string; type: SessionType; minutes: number; intense: boolean; note?: string };

/** Une période de jeûne (horodatages ISO). */
export type Fast = { id: number; start: string; end: string | null };

/** `length` est absent des codes créés avant le passage à 4 chiffres. */
export type PinRecord = { salt: string; hash: string; length?: number };

export type AppData = {
  version: 1;
  profile: Profile;
  pin: PinRecord;
  theme: ThemeName;
  meals: Meal[];
  /** Eau bue par jour (AAAA-MM-JJ), en ml. */
  water: Record<string, number>;
  /** Absent des données où l'eau était comptée en verres (convertis à 200 ml). */
  waterInMl?: boolean;
  /** Dernier montant d'eau saisi à la main (gourde de 750 ml…), proposé en un geste ensuite. */
  customWater?: number;
  weights: WeightEntry[];
  tasks: SportTask[];
  recipes: Recipe[];
  plan: Plan;
  fasts: Fast[];
  sessions: Session[];
  customFoods: CustomFood[];
  leftovers: Leftover[];
  /** Pas par jour (AAAA-MM-JJ). « auto » = podomètre du téléphone ou Health Connect. */
  steps: Record<string, StepEntry>;
  stepGoal: number;
  /** D'où viennent les pas : podomètre du téléphone, Health Connect, ou saisie seule. */
  stepsSource: StepsSource;
  /** Part du volume bu comptée comme hydratation, par type de boisson (en %). */
  hydrationCoefficients?: Partial<Record<"eau" | "the" | "lait" | "jus" | "soda" | "soupe" | "cafe" | "alcool" | "autre", number>>;
  /** Liste de courses : lignes cochées (par nom) et lignes ajoutées à la main. */
  shopping?: { checked: string[]; extras: { id: number; text: string; done: boolean }[] };
  /** Conseil du jour : écran à l'ouverture (affiché par défaut) et conseils gardés en favoris. */
  /** shown : nombre de conseils déjà montrés (un par jour, plus « Un autre conseil ») ; day : jour du dernier. */
  tips?: { splash?: boolean; favorites?: number[]; shown?: number; day?: string };
  /** Rappels : pesée, bilan de la semaine, repas prévus (voir reminders.ts). */
  reminders?: import("./reminders").ReminderSettings;
  /** Cru / cuit retenu par aliment (voir cooking.ts). */
  cookPrefs?: Record<string, import("./cooking").CookPref>;
  /** Photos de produits ajoutées par l'utilisateur (clé du produit → petite image), quand la fiche n'en a pas. */
  productImages?: Record<string, string>;
  /** Durée de conservation des brouillons de repas, en heures (24 par défaut). */
  draftHours?: number;
  /** Fiches produits corrigées d'après l'étiquette (par produit, voir corrections.ts). */
  productCorrections?: Record<string, import("./corrections").ProductCorrection>;
  /** Les exemples de recettes de boissons ont déjà été proposés (pour ne pas les rajouter). */
  drinkRecipesOffered?: boolean;
};

export const themes: { id: ThemeName; name: string; mode: string }[] = [
  { id: "sauge", name: "Sauge", mode: "Clair" },
  { id: "nuit", name: "Nuit", mode: "Sombre" },
  { id: "ocean", name: "Océan", mode: "Clair" },
  { id: "lavande", name: "Lavande", mode: "Clair" },
  { id: "eshin", name: "Clan Eshin", mode: "Sombre · malepierre" },
  { id: "sororitas", name: "Adepta Sororitas", mode: "Sombre · cramoisi et or" },
];

export const mealCategories: { id: MealCategory; label: string }[] = [
  { id: "petit-dejeuner", label: "Petit-déjeuner" },
  { id: "dejeuner", label: "Déjeuner" },
  { id: "diner", label: "Dîner" },
  { id: "collation", label: "Collation" },
];

export const limits = {
  age: { min: 15, max: 100, unit: "ans" },
  height: { min: 120, max: 230, unit: "cm" },
  weight: { min: 35, max: 300, unit: "kg" },
};

/** Date locale au format AAAA-MM-JJ (le journal change à minuit, heure du téléphone). */
export function todayKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function defaultPlan(weight: number, date = todayKey()): Plan {
  return { goal: "maintien", program: "equilibre", targetWeight: null, pace: 0.5, startWeight: weight, startDate: date, customMaintenance: null };
}

export function validateBody(values: { age: number; height: number; weight: number }) {
  const errors: string[] = [];
  const labels = { age: "L'âge", height: "La taille", weight: "Le poids" };
  (Object.keys(limits) as (keyof typeof limits)[]).forEach((key) => {
    const value = values[key];
    const { min, max, unit } = limits[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${labels[key]} doit être compris entre ${min} et ${max} ${unit}.`);
    }
  });
  return errors;
}


/** Exemples de recettes de boissons, proposés une fois. */
export const drinkRecipeExamples: Recipe[] = [
  {
    id: 3,
    name: "Smoothie banane-fraise",
    category: "boisson",
    ingredients: [
      {
        title: "",
        items: [
          { quantity: 1, unit: "", name: "banane" },
          { quantity: 150, unit: "g", name: "fraises" },
          { quantity: 150, unit: "ml", name: "lait demi-écrémé" },
          { quantity: 1, unit: "", name: "yaourt nature" },
          { quantity: 1, unit: "c. à café", name: "miel (facultatif)" },
        ],
      },
    ],
    steps: [
      {
        title: "",
        steps: [
          { title: "Préparer les fruits", text: "Équeuter les fraises et couper la banane en rondelles." },
          { title: "Mixer", text: "Mixer tous les ingrédients 1 minute jusqu'à obtenir un mélange lisse. Servir bien frais." },
        ],
      },
    ],
    time: 5,
    portions: 2,
    calories: 160,
    protein: 7,
  },
  {
    id: 4,
    name: "Chocolat chaud maison",
    category: "boisson",
    ingredients: [
      {
        title: "",
        items: [
          { quantity: 250, unit: "ml", name: "lait demi-écrémé" },
          { quantity: 15, unit: "g", name: "cacao en poudre non sucré" },
          { quantity: 1, unit: "c. à café", name: "sucre" },
          { quantity: 1, unit: "pincée", name: "cannelle" },
        ],
      },
    ],
    steps: [
      {
        title: "",
        steps: [
          { title: "Chauffer", text: "Faire chauffer le lait à feu doux sans le faire bouillir." },
          { title: "Mélanger", text: "Ajouter le cacao, le sucre et la cannelle en fouettant jusqu'à ce qu'il n'y ait plus de grumeaux." },
        ],
      },
    ],
    time: 5,
    portions: 1,
    calories: 190,
    protein: 12,
  },
];
export function defaultData(profile: Profile, pin: PinRecord, theme: ThemeName, plan: Plan): AppData {
  const today = todayKey();
  return {
    version: 1,
    profile,
    pin,
    theme,
    meals: [],
    water: {},
    waterInMl: true,
    weights: [{ id: Date.now(), date: today, kg: profile.weight }],
    tasks: programFor(plan.program).tasks.map((label, index) => ({ id: index + 1, label, detail: "À planifier", done: false })),
    recipes: [
      {
        id: 1,
        name: "Bowl poulet & quinoa",
        category: "plat",
        ingredients: [
          {
            title: "Bowl",
            items: [
              { quantity: 250, unit: "g", name: "filets de poulet" },
              { quantity: 120, unit: "g", name: "quinoa" },
              { quantity: 1, unit: "", name: "avocat" },
              { quantity: 150, unit: "g", name: "tomates cerises" },
              { quantity: 2, unit: "poignées", name: "épinards frais" },
            ],
          },
          {
            title: "Sauce",
            items: [
              { quantity: 1, unit: "c. à soupe", name: "huile d'olive" },
              { quantity: 1, unit: "", name: "citron" },
              { quantity: null, unit: "", name: "Sel, poivre" },
            ],
          },
        ],
        steps: [
          {
            title: "Bowl",
            steps: [
              { title: "Le quinoa", text: "Rincer le quinoa puis le cuire 12 min dans 2 fois son volume d'eau salée." },
              { title: "Le poulet", text: "Couper le poulet en lanières et le saisir 8 min à la poêle. Saler, poivrer." },
              { title: "Le montage", text: "Répartir le quinoa, les épinards, le poulet, l'avocat en tranches et les tomates dans deux bols." },
            ],
          },
          {
            title: "Sauce",
            steps: [{ title: "", text: "Mélanger l'huile d'olive et le jus du citron, puis arroser les bols." }],
          },
        ],
        time: 25,
        portions: 2,
        calories: 520,
        protein: 38,
      },
      {
        id: 2,
        name: "Pancakes banane",
        category: "petit-dejeuner",
        ingredients: [
          {
            title: "",
            items: [
              { quantity: 2, unit: "", name: "bananes bien mûres" },
              { quantity: 2, unit: "", name: "œufs" },
              { quantity: 60, unit: "g", name: "flocons d'avoine" },
              { quantity: 80, unit: "ml", name: "lait" },
              { quantity: 1, unit: "pincée", name: "cannelle" },
            ],
          },
        ],
        steps: [
          {
            title: "",
            steps: [
              { title: "La pâte", text: "Écraser les bananes, puis mixer avec les œufs, les flocons d'avoine, le lait et la cannelle." },
              { title: "La cuisson", text: "Dans une poêle antiadhésive à feu moyen, verser une petite louche de pâte et cuire 2 min de chaque côté." },
            ],
          },
        ],
        time: 15,
        portions: 2,
        calories: 340,
        protein: 16,
      },
      ...drinkRecipeExamples,
    ],
    drinkRecipesOffered: true,
    plan,
    fasts: [],
    sessions: [],
    customFoods: [],
    leftovers: [],
    steps: {},
    stepGoal: 8000,
    stepsSource: null,
  };
}

function isAppData(value: unknown): value is AppData {
  const data = value as AppData | null;
  return !!data && data.version === 1 && !!data.profile && !!data.pin?.hash && Array.isArray(data.meals);
}

/**
 * Avant les parties, les ingrédients étaient un texte (« Poulet, quinoa » ou une ligne
 * par ingrédient) et les étapes une simple liste de phrases.
 */
function migrateRecipe(recipe: Recipe): Recipe {
  const legacy = recipe as unknown as { ingredients: unknown; steps?: unknown };
  const ingredients = typeof legacy.ingredients === "string"
    ? [{ title: "", items: ingredientLines(legacy.ingredients).map(parseIngredientLine) }]
    : recipe.ingredients ?? [];
  // Valeurs inventées par l'ancienne estimation (95 kcal par ingrédient) : « à calculer ».
  const estimate = legacyEstimate(ingredients.flatMap((group) => group.items.map((item) => item.name)));
  const guessed = recipe.calories === estimate.calories && recipe.protein === estimate.protein;
  // Ligne de valeurs lue comme un ingrédient (« 1 portion – 339 kcal – 36 g P ») : on la retire,
  // et ses valeurs remplacent l'ancienne estimation.
  const valuesLine = ingredients.flatMap((group) => group.items).find((item) => /\d\s*kcal\b/i.test(`${item.quantity ?? ""} ${item.unit} ${item.name}`));
  const kcal = valuesLine?.name.match(/(\d+)\s*kcal/i);
  const protein = valuesLine?.name.match(/(\d+)\s*g\s*(?:de\s+)?(?:P\b|prot)/i);
  const carbs = valuesLine?.name.match(/(\d+)\s*g\s*(?:de\s+)?(?:G\b|gluc)/);
  const written = guessed && kcal ? { calories: Number(kcal[1]), protein: protein ? Number(protein[1]) : 0, ...(carbs ? { carbs: Number(carbs[1]) } : {}), ...(/^\s*portions?\b/i.test(`${valuesLine!.unit} ${valuesLine!.name}`) && valuesLine!.quantity ? { portions: valuesLine!.quantity } : {}) } : null;
  return {
    ...recipe,
    ingredients: valuesLine
      ? ingredients.map((group) => ({ ...group, items: group.items.filter((item) => item !== valuesLine) })).filter((group) => group.items.length)
      : ingredients,
    steps: Array.isArray(legacy.steps) && legacy.steps.some((step) => typeof step === "string")
      ? [{ title: "", steps: (legacy.steps as string[]).map((text) => ({ title: "", text })) }]
      : recipe.steps ?? [],
    ...(guessed ? written ?? { calories: 0, protein: 0 } : {}),
  };
}

/** Complète les données enregistrées par une version précédente de l'app. */
function migrate(data: AppData): AppData {
  const activity = legacyActivity[data.profile.activity] ?? data.profile.activity;
  const firstWeight = [...(data.weights ?? [])].sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    ...data,
    theme: legacyThemes[data.theme] ?? data.theme,
    // L'eau était comptée en verres : 1 verre = 200 ml.
    water: data.waterInMl ? data.water ?? {} : Object.fromEntries(Object.entries(data.water ?? {}).map(([day, glasses]) => [day, glasses * 200])),
    waterInMl: true,
    profile: { ...data.profile, activity },
    sessions: data.sessions ?? [],
    customFoods: data.customFoods ?? [],
    leftovers: data.leftovers ?? [],
    steps: data.steps ?? {},
    stepGoal: data.stepGoal ?? 8000,
    // « stepsSync » : ancienne option, qui ne pouvait être que Health Connect.
    stepsSource: data.stepsSource !== undefined ? data.stepsSource : (data as { stepsSync?: boolean }).stepsSync ? "health" : null,
    // Exemples de boissons proposés une seule fois, si la catégorie est encore vide.
    recipes: [
      ...(data.recipes ?? []).map(migrateRecipe),
      ...(!data.drinkRecipesOffered && !(data.recipes ?? []).some((recipe) => recipe.category === "boisson") ? drinkRecipeExamples : []),
    ],
    drinkRecipesOffered: true,
    plan: data.plan ?? defaultPlan(firstWeight?.kg ?? data.profile.weight, firstWeight?.date),
    fasts: data.fasts ?? [],
  };
}

export function loadData(): AppData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isAppData(parsed) ? migrate(parsed) : null;
  } catch {
    return null;
  }
}

export function saveData(data: AppData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Quota dépassé (photo trop lourde) ou stockage bloqué.
    return false;
  }
}

export function clearData() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à effacer
  }
}

/** Une sauvegarde contient les données et, depuis l'ajout des captures, les images des recettes. */
export type Backup = { data: AppData; images: Record<string, string> };

export function parseBackup(text: string): Backup | null {
  try {
    const { images, ...parsed } = JSON.parse(text);
    return isAppData(parsed) ? { data: migrate(parsed), images: images ?? {} } : null;
  } catch {
    return null;
  }
}

// --- Code PIN ---------------------------------------------------------------
// Le PIN n'est jamais stocké en clair : on garde un hash SHA-256 salé.
// Sans back-end, cela empêche seulement de lire le code dans le stockage ;
// ce n'est pas un chiffrement des données.

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => (bytes[index] = Math.floor(Math.random() * 256)));
  return toHex(bytes.buffer);
}

async function digest(text: string) {
  if (window.crypto?.subtle) {
    return toHex(await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  }
  // Repli si le contexte n'expose pas crypto.subtle.
  let hash = 0x811c9dc5;
  for (let round = 0; round < 1000; round += 1) {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index) + round;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return `fnv-${hash.toString(16)}`;
}

export async function createPin(pin: string): Promise<PinRecord> {
  const salt = randomSalt();
  return { salt, hash: await digest(`${salt}:${pin}`), length: pin.length };
}

/** Les codes créés avant le passage à 4 chiffres en comptent 6. */
export function pinLength(record: PinRecord) {
  return record.length ?? 6;
}

export async function checkPin(pin: string, record: PinRecord) {
  return (await digest(`${record.salt}:${pin}`)) === record.hash;
}

// --- Photo de profil --------------------------------------------------------

/** Recadre en carré et réduit à 320 px pour ne pas saturer le localStorage. */
export function resizePhoto(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Image illisible"));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Canvas indisponible"));
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function initials(profile: Pick<Profile, "firstName" | "lastName" | "pseudo">) {
  const letters = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim();
  return (letters || profile.pseudo.slice(0, 2)).toUpperCase();
}

import { useEffect, useRef, useState } from "react";
import ActivityTab from "../components/ActivityTab";
import ChangePin from "../components/ChangePin";
import FastingCard from "../components/FastingCard";
import MealComposer, { type MealExtras } from "../components/MealComposer";
import GoalCard from "../components/GoalCard";
import Icon, { type IconName } from "../components/Icon";
import PlanEditor from "../components/PlanEditor";
import PlanResults from "../components/PlanResults";
import RecipePortionPicker from "../components/RecipePortionPicker";
import RecipesTab from "../components/RecipesTab";
import QuickWeigh from "../components/QuickWeigh";
import ReminderSettings from "../components/ReminderSettings";
import { REMINDER_EVENT, syncReminders, takeReminderTarget, type ReminderTarget } from "../lib/reminders";
import ShareImport from "../components/ShareImport";
import { mealPayload, shareInHash, type SharedMeal, type SharedRecipe, type SharePayload } from "../lib/share";
import ShareSheet from "../components/ShareSheet";
import { INCOMING_EVENT, takeIncomingShare } from "../lib/incomingShare";
import { cleanMealName, eatenItems, recipeFromMeal } from "../lib/sharedMeal";
import { freeLabel } from "../lib/freeDays";
import type { MealItem } from "../lib/storage";
import StepsPanel from "../components/StepsPanel";
import TrackingTab, { type TrackingView } from "../components/TrackingTab";
import { exportBackup } from "../lib/backup";
import { backfillCarbs, backfillExtras } from "../lib/carbsBackfill";
import { correctPastMeals, mealsWithProduct } from "../lib/corrections";
import { CorrectionsContext, type CorrectionsApi } from "../lib/correctionsContext";
import { DRAFT_HOURS, hasContent, lastTab, mealDraft, setDraftHours, type MealDraft } from "../lib/drafts";
import { programFor } from "../lib/goals";
import { tipAt, tips, tipThemes } from "../lib/tips";
import TipSplash from "../components/TipSplash";
import TipsCorner from "../components/TipsCorner";
import RecapDownload from "../components/RecapDownload";
import { restoreImages } from "../lib/images";
import { readPhoneSteps, readSteps } from "../lib/steps";
import { recipeResult, toMealItem } from "../lib/foods";
import { drinkCategories, hydrationOf } from "../lib/hydration";
import { eatenMeals, isPlanned } from "../lib/planning";
import { formatWater, WATER_MAX, waterAmounts, waterGoal } from "../lib/water";
import { computePlan, observedMaintenance } from "../lib/nutrition";
import { bodyErrors, draftFrom, goalErrors, parseDraft } from "../lib/planDraft";
import {
  initials,
  mealCategories,
  parseBackup,
  resizePhoto,
  themes,
  todayKey,
  type AppData,
  type Meal,
  type MealCategory,
  type Recipe,
  type StepsSource,
} from "../lib/storage";

type MainAppProps = {
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  onLock: () => void;
  onReset: () => void;
  onImport: (data: AppData) => void;
};

type Tab = "Accueil" | "Suivi" | "Activité" | "Recettes" | "Profil";
type ModalType = "meal" | "portion" | "add" | "pin" | "steps" | "share" | "share-out" | "weigh" | "tips" | "recap" | null;

function defaultCategory(date = new Date()): MealCategory {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 10.5) return "petit-dejeuner";
  if (hour < 15) return "dejeuner";
  if (hour < 18) return "collation";
  return "diner";
}

const categoryStyle: Record<MealCategory, string> = {
  "petit-dejeuner": "breakfast",
  dejeuner: "lunch",
  diner: "dinner",
  collation: "breakfast",
};

export default function MainApp({ data, update, onLock, onReset, onImport }: MainAppProps) {
  const { profile, theme } = data;
  const today = todayKey();
  // Après une fermeture de l'app par Android : on revient sur le même onglet, et un repas
  // en cours de saisie rouvre sa fenêtre avec son brouillon.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = lastTab.load();
    return (["Accueil", "Suivi", "Activité", "Recettes", "Profil"] as string[]).includes(saved ?? "") ? (saved as Tab) : "Accueil";
  });
  useEffect(() => lastTab.save(activeTab), [activeTab]);
  const [startDraft] = useState(() => {
    setDraftHours(data.draftHours);
    // L'app a été fermée pendant une saisie : le repas ouvert à ce moment-là revient.
    const draft = mealDraft.all().find((entry) => entry.open && hasContent(entry)) ?? null;
    if (draft) mealDraft.resume(draft);
    return draft;
  });
  useEffect(() => setDraftHours(data.draftHours), [data.draftHours]);
  const [modal, setModal] = useState<ModalType>(startDraft ? "meal" : null);
  /** Brouillon repris dans la fenêtre d'ajout de repas (null : fenêtre vierge). */
  const [restoredDraft, setRestoredDraft] = useState<MealDraft | null>(startDraft);
  /** Change pour repartir d'une fenêtre vierge (« Effacer le brouillon »). */
  const [composerKey, setComposerKey] = useState(0);
  /** Photo à analyser dans la fenêtre d'ajout de repas. */
  const [mealPhoto, setMealPhoto] = useState<File | null>(null);
  // La photo ne sert qu'à l'ouverture de cette fenêtre-là.
  /** Recette ouverte depuis le carnet : ajoutée au repas, on choisit les parts mangées. */
  const [mealRecipe, setMealRecipe] = useState<Recipe | null>(null);
  /** Repas déjà noté qu'on corrige (moment, jour, aliments). */
  const [editingMeal, setEditingMeal] = useState<Meal | null>(() => (startDraft?.editingId ? data.meals.find((meal) => meal.id === startDraft.editingId) ?? null : null));
  // Partage reçu : lien ouvert (#partage=…) ou collé dans « Recevoir un partage ».
  const [shareText, setShareText] = useState<string | undefined>(undefined);
  const [focusRecipeId, setFocusRecipeId] = useState<number | null>(null);
  /** Repas ouvert depuis un partage : message dédié à la place de « repas en cours repris ». */
  const [sharedMealNotice, setSharedMealNotice] = useState<string | undefined>(undefined);
  /** Recette tirée d'un repas reçu, à vérifier dans le formulaire avant de l'enregistrer. */
  const [prefillRecipe, setPrefillRecipe] = useState<Recipe | null>(null);
  useEffect(() => {
    const receive = () => {
      const link = shareInHash(window.location.hash);
      if (!link) return;
      // Le lien est lu une fois : on le retire de l'adresse pour ne pas le rouvrir.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setShareText(link);
      setModal("share");
    };
    // Appli Android : lien touché dans une conversation (gardé si l'écran du code était affiché).
    const openLink = (link: string | null) => { if (link) { takeIncomingShare(); setShareText(link); setModal("share"); } };
    const fromApp = (event: Event) => openLink((event as CustomEvent<string>).detail);
    receive();
    openLink(takeIncomingShare());
    // Lien ouvert alors que l'appli web est déjà ouverte dans cet onglet.
    window.addEventListener("hashchange", receive);
    window.addEventListener(INCOMING_EVENT, fromApp);
    return () => { window.removeEventListener("hashchange", receive); window.removeEventListener(INCOMING_EVENT, fromApp); };
  }, []);
  // Conseil du jour : un nouveau chaque jour (compteur gardé), montré en grand à la première
  // ouverture de la journée seulement ; « Un autre conseil » passe au suivant.
  const newTipDay = data.tips?.day !== today;
  const [tipCount, setTipCount] = useState(() => (data.tips?.shown ?? 0) + (newTipDay ? 1 : 0));
  useEffect(() => {
    if ((data.tips?.shown ?? 0) !== tipCount || data.tips?.day !== today) update((current) => ({ ...current, tips: { ...current.tips, shown: tipCount, day: today } }));
  }, [tipCount, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextTip = () => setTipCount((count) => count + 1);
  const todayTip = tipAt(tipCount);
  const favoriteTips = data.tips?.favorites ?? [];
  const toggleFavoriteTip = (id: number) => update((current) => {
    const favorites = current.tips?.favorites ?? [];
    return { ...current, tips: { ...current.tips, favorites: favorites.includes(id) ? favorites.filter((entry) => entry !== id) : [...favorites, id] } };
  });
  const [showSplash, setShowSplash] = useState(() => newTipDay && data.tips?.splash !== false && !startDraft);
  // Rappels reprogrammés quand les réglages ou les repas prévus changent.
  const plannedKey = data.meals.filter(isPlanned).map((meal) => `${meal.id}:${meal.date}:${meal.category}`).join(",");
  useEffect(() => { void syncReminders(data).catch(() => undefined); }, [JSON.stringify(data.reminders ?? null), plannedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Notification touchée : pesée rapide, bilan de la semaine ou repas prévu à confirmer.
  useEffect(() => {
    const open = (target: ReminderTarget | null) => {
      if (target === "pesee") setModal("weigh");
      else if (target === "bilan") goTo("Suivi", "bilan-semaine");
      else if (target === "prevu") goTo("Accueil");
    };
    const onTap = (event: Event) => { takeReminderTarget(); open((event as CustomEvent<ReminderTarget>).detail); };
    open(takeReminderTarget());
    window.addEventListener(REMINDER_EVENT, onTap);
    return () => window.removeEventListener(REMINDER_EVENT, onTap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openShareImport = () => { setShareText(undefined); setModal("share"); };
  /** Envoyer un repas (à son ou sa partenaire…) : il ou elle choisit ses quantités en l'ajoutant. */
  const [outgoingShare, setOutgoingShare] = useState<SharePayload | null>(null);
  const shareMeal = (meal: Meal) => { setOutgoingShare(mealPayload(meal)); setModal("share-out"); };
  const addSharedRecipe = (recipe: SharedRecipe) => {
    const id = Date.now();
    update((current) => ({ ...current, recipes: [...current.recipes, { ...recipe, id }] }));
    flash(`« ${recipe.name} » ajoutée à ton carnet`);
    focusRecipe(id);
  };
  /** Ouvre une recette du carnet une seule fois (pas à chaque retour sur l'onglet). */
  const focusRecipe = (id: number) => {
    goTo("Recettes");
    setFocusRecipeId(id);
    window.setTimeout(() => setFocusRecipeId(null), 300);
  };
  /** Repas reçu : ouvert comme repas (la part mangée) ou comme assiette maison (le plat entier). */
  const openSharedMeal = (meal: SharedMeal & { items: MealItem[] }, as: "meal" | "plate" = meal.plate ? "plate" : "meal") => {
    const plate = as === "plate" ? meal.plate ?? { servings: 1, share: 1 } : undefined;
    if (as === "meal") meal = { ...meal, items: eatenItems(meal), plate: undefined, name: cleanMealName(meal.name) };
    setPlanning(false);
    setOfferedDraft(null);
    setEditingMeal(null);
    setRestoredDraft({
      date: today, category: meal.category, mode: plate ? "plate" : "meal", lines: meal.items,
      plateName: plate ? cleanMealName(meal.name) : "", servings: plate?.servings ?? 2,
      parts: plate ? Math.max(0.5, Math.round(plate.share * plate.servings * 2) / 2) : 1,
      adjust: 0, keepLeftover: false, query: "",
    });
    setSharedMealNotice(as === "plate" ? "Assiette reçue en partage : règle le plat, le nombre de personnes et ta part, puis enregistre." : "Repas reçu en partage : choisis le jour, le moment et ta quantité, puis enregistre.");
    setMealDate(today);
    setComposerKey((value) => value + 1);
    setModal("meal");
  };
  useEffect(() => {
    if (modal !== "meal") setSharedMealNotice(undefined);
    if (modal !== "meal" && modal !== "portion") { setMealPhoto(null); setMealRecipe(null); setEditingMeal(null); }
    // Fenêtre fermée : le brouillon reste, proposé à la prochaine ouverture.
    if (modal !== "meal") mealDraft.close();
  }, [modal]);

  // Repas et recettes notés avant le suivi des glucides : complétés une fois, en arrière-plan.
  useEffect(() => {
    let alive = true;
    backfillCarbs(data).then((apply) => { if (alive && apply) update(apply); }).catch(() => undefined);
    backfillExtras(data).then((apply) => { if (alive && apply) update(apply); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const editMeal = (meal: Meal) => {
    const draft = mealDraft.loadEditing(meal.id);
    if (draft) mealDraft.resume(draft);
    setRestoredDraft(draft);
    setEditingMeal(meal);
    setMealDate(meal.date);
    setModal("meal");
  };
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [notice, setNotice] = useState("");
  const [planDraft, setPlanDraft] = useState(() => draftFrom(profile, data.plan));
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  /** Jour auquel le formulaire de repas ajoute l'entrée (aujourd'hui, ou un jour choisi dans le suivi). */
  const [mealDate, setMealDate] = useState(startDraft?.date ?? today);
  const photoInput = useRef<HTMLInputElement>(null);
  /** Sans « capture » : Android ouvre la galerie au lieu de l'appareil photo. */
  const galleryInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  // Une pesée met à jour le poids du profil : le formulaire de calcul suit.
  useEffect(() => {
    setPlanDraft((draft) => ({ ...draft, weight: String(profile.weight) }));
  }, [profile.weight]);

  const plan = data.plan;
  const result = computePlan(profile, plan);
  const goal = result.target;
  const program = programFor(plan.program);
  const showProtein = plan.program === "seche" || plan.program === "masse";
  // Repas mangés aujourd'hui ; les repas prévus attendent un « J'ai mangé ».
  const todayMeals = eatenMeals(data.meals).filter((meal) => meal.date === today);
  const plannedToday = data.meals.filter((meal) => meal.date === today && isPlanned(meal));
  const consumed = todayMeals.reduce((sum, meal) => sum + meal.calories, 0);
  const proteinToday = todayMeals.reduce((sum, meal) => sum + (meal.protein ?? 0), 0);
  const carbsToday = todayMeals.reduce((sum, meal) => sum + (meal.carbs ?? 0), 0);
  const observed = observedMaintenance(eatenMeals(data.meals), data.weights, today);

  // Aperçu en direct pendant la saisie ; la valeur enregistrée sinon.
  const draftValid = !bodyErrors(planDraft).length && !goalErrors(planDraft).length;
  const preview = draftValid ? parseDraft(planDraft) : { body: profile, plan };
  const previewResult = draftValid ? computePlan(preview.body, { ...preview.plan, customMaintenance: plan.customMaintenance }) : result;
  const remaining = goal - consumed;
  const progress = Math.round((consumed / goal) * 100);
  const water = data.water[today] ?? 0;
  // Eau ajoutée ici + boissons des repas du jour (calculées, jamais recopiées).
  const hydration = hydrationOf(data, today);
  const [waterDetail, setWaterDetail] = useState(false);
  /** La boisson reste dans le repas (calories), mais ne compte plus dans l'hydratation. */
  const removeDrink = (mealId: number, index: number) =>
    update((current) => ({
      ...current,
      meals: current.meals.map((meal) => (meal.id !== mealId || !meal.items ? meal : { ...meal, items: meal.items.map((item, i) => (i === index ? { ...item, hydrates: false } : item)) })),
    }));
  /** Fiches corrigées d'après l'étiquette : gardées à part, repas passés changés sur demande. */
  const correctionsApi: CorrectionsApi = {
    corrections: data.productCorrections ?? {},
    save: (key, correction, recountPast) => update((current) => {
      const next = { ...current, productCorrections: { ...current.productCorrections, [key]: correction } };
      return recountPast ? correctPastMeals(next, key, correction) : next;
    }),
    pastMeals: (key, correction) => mealsWithProduct(data.meals, key, correction).length,
    cookPrefs: data.cookPrefs ?? {},
    saveCookPref: (key, pref) => update((current) => ({ ...current, cookPrefs: { ...current.cookPrefs, [key]: { ...current.cookPrefs?.[key], ...pref } } })),
  };
  const goalWater = waterGoal(profile.sex);
  const stepsToday = data.steps[today];
  const latestWeight = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const displayName = profile.pseudo || profile.firstName;
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  /**
   * Relit les pas des 7 derniers jours (podomètre du téléphone ou Health Connect).
   * Une saisie manuelle plus élevée est gardée : le téléphone ne compte pas les pas
   * faits sans lui. `source` sert juste après un changement, avant que l'état suive.
   */
  const syncSteps = async (source: StepsSource = data.stepsSource) => {
    if (!source) return 0;
    const counts = source === "phone" ? await readPhoneSteps(7) : await readSteps(7);
    const updatedAt = new Date().toISOString();
    update((current) => {
      const steps = { ...current.steps };
      for (const [day, count] of Object.entries(counts)) {
        const existing = steps[day];
        if (existing?.source === "manuel" && existing.count > count) continue;
        steps[day] = { count, source: "auto", updatedAt };
      }
      return { ...current, steps };
    });
    return Object.keys(counts).length;
  };

  // Lecture automatique à l'ouverture et à chaque retour dans l'app.
  useEffect(() => {
    if (!data.stepsSource) return;
    syncSteps().catch(() => undefined);
    const onVisible = () => { if (!document.hidden) syncSteps().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stepsSource]);

  const deleteMeal = (meal: Meal) => {
    if (window.confirm(`Supprimer « ${meal.name} » (${meal.calories} kcal) du journal ?`)) {
      update((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }));
    }
  };

  /** Restes encore bons : 4 jours au frigo au plus (repère des agences sanitaires). */
  const leftoverLimit = (() => { const date = new Date(); date.setDate(date.getDate() - 3); return todayKey(date); })();
  const freshLeftovers = data.leftovers.filter((item) => item.date >= leftoverLimit && item.partsLeft > 0);

  const saveMeal = (meal: Omit<Meal, "id">, extras: MealExtras) => {
    update((current) => {
      const leftovers = current.leftovers
        .map((item) => {
          const used = extras.usedLeftovers.filter((entry) => entry.id === item.id).reduce((sum, entry) => sum + entry.parts, 0);
          return used ? { ...item, partsLeft: Math.round((item.partsLeft - used) * 10) / 10 } : item;
        })
        // On oublie les restes finis ou trop vieux.
        .filter((item) => item.partsLeft > 0 && item.date >= leftoverLimit);
      if (extras.leftover) leftovers.push({ ...extras.leftover, id: Date.now() + 1 });
      const meals = editingMeal
        ? current.meals.map((item) => (item.id === editingMeal.id ? { ...meal, id: item.id } : item))
        : [...current.meals, { ...meal, id: Date.now() }];
      // Recette comptée en morceaux ou en grammes : la taille du plat entier est gardée pour la prochaine fois.
      const recipes = current.recipes.map((recipe) => {
        // Poids estimé d'après les ingrédients : pas gardé comme poids pesé.
        const used = meal.items?.find((item) => item.source === "recette" && item.ref === String(recipe.id) && !item.recipeGramsEstimated);
        if (!used || (used.recipePieces === recipe.pieces && used.recipeGrams === recipe.totalGrams)) return recipe;
        return { ...recipe, pieces: used.recipePieces ?? recipe.pieces, totalGrams: used.recipeGrams ?? recipe.totalGrams };
      });
      return { ...current, meals, leftovers, recipes };
    });
    mealDraft.clear();
    setRestoredDraft(null);
    setModal(null);
    flash(meal.free ? `Repas libre noté : ce jour sort de tes moyennes` : editingMeal ? `Repas modifié · ${meal.calories} kcal` : extras.leftover ? `Ma part : ${meal.calories} kcal · reste gardé` : `Repas enregistré · ${meal.calories} kcal`);
  };

  /** Repas prévu confirmé « mangé tel quel » : il compte à partir de maintenant. */
  const confirmPlanned = (meal: Meal) => {
    update((current) => ({ ...current, meals: current.meals.map((item) => (item.id === meal.id ? { ...item, status: undefined, drinksCounted: true } : item)) }));
    flash(`Mangé · ${meal.calories} kcal`);
  };

  const discardLeftover = (id: number) => {
    if (window.confirm("Jeter ce reste ? Il ne sera plus proposé.")) {
      update((current) => ({ ...current, leftovers: current.leftovers.filter((item) => item.id !== id) }));
    }
  };

  /** Repas prévu, ouvert depuis le planning. */
  const [planning, setPlanning] = useState(false);
  /** Repas commencé puis laissé de côté : on demande s'il faut le reprendre. */
  const [offeredDraft, setOfferedDraft] = useState<MealDraft | null>(null);
  const openMealForm = (date = today, planned = false) => {
    setPlanning(planned);
    // Brouillon du moment de repas en cours (dîner le soir…), sinon le plus récent.
    const drafts = mealDraft.all().filter((entry) => !entry.editingId && hasContent(entry));
    const draft = drafts.find((entry) => entry.category === defaultCategory()) ?? drafts[0] ?? null;
    setRestoredDraft(null);
    setOfferedDraft(draft);
    setMealDate(date);
    setModal("meal");
  };

  /** Dernière quantité ajoutée : le bouton « moins » l'annule. */
  const [lastWater, setLastWater] = useState(200);
  const [waterDraft, setWaterDraft] = useState("");
  /** Montant personnalisé : ajouté puis retenu pour la prochaine fois. */
  const addCustomWater = (event: React.FormEvent) => {
    event.preventDefault();
    const ml = Math.round(Number(waterDraft.replace(",", ".")));
    if (!(ml > 0) || ml > 3000) { flash("Entre un montant entre 1 et 3 000 ml"); return; }
    addWater(ml);
    update((current) => ({ ...current, customWater: ml }));
    setWaterDraft("");
  };
  const addWater = (ml: number) => {
    if (ml > 0) setLastWater(ml);
    update((current) => ({ ...current, water: { ...current.water, [today]: Math.max(0, Math.min(WATER_MAX, (current.water[today] ?? 0) + ml)) } }));
  };

  /** Photo prise depuis l'accueil : la fenêtre d'ajout de repas l'analyse à l'ouverture. */
  const takeMealPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMealPhoto(file);
    openMealForm();
  };

  const changeAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const photo = await resizePhoto(file);
      update((current) => ({ ...current, profile: { ...current.profile, photo } }));
      flash("Photo de profil mise à jour");
    } catch {
      flash("Cette image n'a pas pu être lue");
    }
  };

  const removeAvatar = () => update((current) => ({ ...current, profile: { ...current.profile, photo: null } }));

  const saveIdentity = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        firstName: String(form.get("firstName")).trim(),
        lastName: String(form.get("lastName")).trim(),
        pseudo: String(form.get("pseudo")).trim(),
      },
    }));
    setEditingIdentity(false);
    flash("Profil enregistré");
  };

  /** Une pesée par jour : la même date remplace la valeur. Le profil suit la pesée la plus récente. */
  const saveWeight = (date: string, kg: number) =>
    update((current) => {
      const weights = [...current.weights.filter((entry) => entry.date !== date), { id: Date.now(), date, kg }];
      const latest = [...weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
      return { ...current, weights, profile: { ...current.profile, weight: latest.kg } };
    });

  const deleteWeight = (id: number) =>
    update((current) => {
      const weights = current.weights.filter((entry) => entry.id !== id);
      const latest = [...weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      return { ...current, weights, profile: { ...current.profile, weight: latest?.kg ?? current.profile.weight } };
    });

  const savePlan = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = [...bodyErrors(planDraft), ...goalErrors(planDraft)];
    setPlanErrors(errors);
    if (errors.length) return;
    const { body, plan: next } = parseDraft(planDraft);
    if (body.weight !== profile.weight) saveWeight(today, body.weight);
    // Nouvel objectif : la progression repart du poids actuel.
    const restart = next.goal !== plan.goal || next.targetWeight !== plan.targetWeight;
    const newProgram = next.program !== plan.program ? programFor(next.program) : null;
    const addTasks = !!newProgram && window.confirm(`Ajouter les défis conseillés pour « ${newProgram.label} » ?\n\n${newProgram.tasks.join("\n")}`);
    update((current) => ({
      ...current,
      profile: { ...current.profile, ...body },
      plan: {
        ...current.plan,
        ...next,
        startWeight: restart ? body.weight : current.plan.startWeight,
        startDate: restart ? today : current.plan.startDate,
      },
      tasks: addTasks && newProgram
        ? [...current.tasks, ...newProgram.tasks.filter((label) => !current.tasks.some((task) => task.label === label)).map((label, index) => ({ id: Date.now() + index, label, detail: "À planifier", done: false }))]
        : current.tasks,
    }));
    flash("Objectif enregistré");
  };

  const applyObserved = (value: number | null) =>
    update((current) => ({ ...current, plan: { ...current.plan, customMaintenance: value } }));

  const startFast = () =>
    update((current) => ({ ...current, fasts: [...current.fasts.slice(-60), { id: Date.now(), start: new Date().toISOString(), end: null }] }));

  const stopFast = () =>
    update((current) => ({ ...current, fasts: current.fasts.map((fast) => (fast.end ? fast : { ...fast, end: new Date().toISOString() })) }));

  /** « Ajouter à mes repas » depuis une recette : fenêtre du choix de la quantité mangée. */
  const addRecipeToJournal = (recipe: Recipe) => {
    setMealRecipe(recipe);
    setModal("portion");
  };

  const saveRecipePortion = (meal: Omit<Meal, "id">, remember: Pick<Recipe, "pieces" | "totalGrams">) => {
    const recipeId = mealRecipe?.id;
    update((current) => ({
      ...current,
      meals: [...current.meals, { ...meal, id: Date.now() }],
      recipes: current.recipes.map((recipe) => (recipe.id === recipeId ? { ...recipe, ...remember } : recipe)),
    }));
    setModal(null);
    flash(`Ajouté à mes repas · ${meal.calories} kcal`);
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) {
      flash("Ce fichier n'est pas une sauvegarde Feed Me valide");
      return;
    }
    if (window.confirm("Remplacer toutes les données actuelles par cette sauvegarde ? Le code PIN de la sauvegarde sera demandé.")) {
      try {
        await restoreImages(backup.images);
      } catch {
        flash("Les images de la sauvegarde n'ont pas pu être restaurées");
      }
      onImport(backup.data);
    }
  };

  const runExport = async () => {
    try {
      await exportBackup(data);
    } catch {
      flash("L'export a été annulé ou a échoué");
    }
  };

  const reset = () => {
    if (window.confirm("Effacer définitivement toutes les données de Feed Me sur cet appareil ?\n\nPensez à exporter une sauvegarde avant.")) {
      onReset();
    }
  };

  const [trackingView, setTrackingView] = useState<TrackingView>("jour");
  const goTo = (tab: Tab, section?: string) => {
    setModal(null);
    setActiveTab(tab);
    // Suivi : le bilan et le poids ont chacun leur onglet.
    if (tab === "Suivi") setTrackingView(section === "bilan-semaine" ? "bilan" : section === "suivi-poids" ? "poids" : "jour");
    window.setTimeout(() => (section ? document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }) : window.scrollTo(0, 0)), 50);
  };
  const goToProfile = (section: "mon-objectif") => goTo("Profil", section);
  const goToWeight = () => goTo("Suivi", "suivi-poids");

  const avatar = (
    <>{profile.photo ? <img src={profile.photo} alt="" /> : <span>{initials(profile)}</span>}</>
  );

  return (
    <CorrectionsContext.Provider value={correctionsApi}>
      {showSplash && modal === null && (
        <TipSplash tip={todayTip} favorite={favoriteTips.includes(todayTip.id)} onToggleFavorite={() => toggleFavoriteTip(todayTip.id)} onClose={() => setShowSplash(false)} onOpenCorner={() => { setShowSplash(false); setModal("tips"); }} onNext={nextTip} />
      )}
      <header className="topbar">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>Bonjour, {displayName}</h1>
        </div>
        <button className={activeTab === "Profil" ? "avatar active" : "avatar"} onClick={() => goTo("Profil")} aria-label="Ouvrir mon profil">
          {avatar}
        </button>
      </header>

      {activeTab === "Accueil" && (
        <div className="content">
          <section className="hero-card">
            <div className="hero-copy">
              <span className="status-pill"><Icon name="flame" size={14} /> Objectif du jour</span>
              <p className="calorie-number">{Math.abs(remaining).toLocaleString("fr-FR")}</p>
              <p className="calorie-label">{remaining >= 0 ? "kcal restantes" : "kcal au-delà de l'objectif"}</p>
              {todayMeals.some((meal) => meal.free) && <p className="free-day-note">Journée libre : un repas libre est noté, ce jour sort de tes moyennes.</p>}
              <div className="calorie-meta">
                <span><strong>{consumed.toLocaleString("fr-FR")}</strong> consommées</span>
                <span><strong>{goal.toLocaleString("fr-FR")}</strong> objectif</span>
                {showProtein && <span><strong>{proteinToday}/{result.macros.protein} g</strong> protéines</span>}
                <span><strong>{carbsToday} g</strong> glucides</span>
              </div>
            </div>
            <div className="progress-ring" style={{ "--progress": `${Math.min(progress, 100) * 3.6}deg` } as React.CSSProperties}>
              <div><strong>{progress}%</strong><span>du jour</span></div>
            </div>
          </section>

          <GoalCard plan={plan} result={result} currentWeight={latestWeight?.kg ?? profile.weight} height={profile.height} onOpen={() => goToProfile("mon-objectif")} />

          {plan.program === "jeune" && <FastingCard fasts={data.fasts} onStart={startFast} onStop={stopFast} />}

          <section className="tip-card">
            <span className="metric-icon"><Icon name="apple" /></span>
            <div><p className="eyebrow">Conseil du jour · {tipThemes[todayTip.theme]}</p><p>{todayTip.text}</p><span className="tip-links"><button type="button" className="text-button" onClick={nextTip}>Un autre conseil</button><button type="button" className="text-button" onClick={() => setModal("tips")}>Tous mes conseils ›</button></span></div>
            <button type="button" className={`tip-star${favoriteTips.includes(todayTip.id) ? " on" : ""}`} onClick={() => toggleFavoriteTip(todayTip.id)} aria-pressed={favoriteTips.includes(todayTip.id)} aria-label={favoriteTips.includes(todayTip.id) ? "Retirer des favoris" : "Garder ce conseil en favori"}>{favoriteTips.includes(todayTip.id) ? "★" : "☆"}</button>
          </section>

          <section className="section-block">
            <div className="section-title">
              <div>
                <p className="eyebrow">Aujourd'hui</p>
                <h2>Votre équilibre</h2>
              </div>
              <button className="text-button" onClick={() => goTo("Suivi")}>Voir le détail</button>
            </div>

            <div className="metric-grid">
              <button className="metric-card mint metric-button" onClick={() => setModal("steps")}>
                <span className="metric-icon"><Icon name="shoe" /></span>
                <p>Pas</p>
                <strong>{stepsToday ? stepsToday.count.toLocaleString("fr-FR") : "—"}</strong>
                <small>{stepsToday ? `sur ${data.stepGoal.toLocaleString("fr-FR")}` : "Toucher pour ajouter"}</small>
                <div className="mini-progress"><span style={{ width: `${Math.min(100, ((stepsToday?.count ?? 0) / data.stepGoal) * 100)}%` }} /></div>
              </button>
              <button className="metric-card peach metric-button" onClick={goToWeight}>
                <span className="metric-icon"><Icon name="scale" /></span>
                <p>Poids</p>
                <strong>{latestWeight ? latestWeight.kg.toLocaleString("fr-FR") : "—"} <em>kg</em></strong>
                <small>{latestWeight ? `pesée du ${new Date(`${latestWeight.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : "Ajouter une pesée"}</small>
                <div className="mini-progress"><span style={{ width: "100%" }} /></div>
              </button>
            </div>
          </section>

          <section className="water-card">
            <div className="water-info">
              <span className="water-icon"><Icon name="water" /></span>
              <div>
                <p>Hydratation</p>
                <strong>{formatWater(hydration.totalMl)} <span>sur {formatWater(goalWater)}</span></strong>
                {hydration.mealsMl > 0 && <small className="water-split">Eau pure {formatWater(hydration.pureWaterMl)} · boissons des repas {formatWater(hydration.mealsMl)}</small>}
                {hydration.sources.length > 0 && <button type="button" className="text-button water-detail-toggle" onClick={() => setWaterDetail((value) => !value)}>{waterDetail ? "Masquer le détail" : "Voir le détail"}</button>}
              </div>
              <button className="round-button soft" onClick={() => addWater(-lastWater)} disabled={water === 0} aria-label={`Retirer ${lastWater} ml`}>
                <Icon name="minus" size={18} />
              </button>
            </div>
            <div className="water-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (hydration.totalMl / goalWater) * 100)}%` }} /></div>
            {/* D'où vient chaque apport ; une boisson peut être retirée de l'hydratation. */}
            {waterDetail && (
              <ul className="water-sources">
                {water > 0 && <li><span><strong>Eau ajoutée ici</strong><small>Verres et bouteilles</small></span><em>{formatWater(water)}</em></li>}
                {hydration.sources.map((source) => (
                  <li key={`${source.mealId}-${source.index}`}>
                    <span>
                      <strong>{source.name}</strong>
                      <small>{formatWater(Math.round(source.ml))} bus{source.countedMl !== source.ml ? ` · ${formatWater(Math.round(source.countedMl))} comptés (${drinkCategories.find((item) => item.id === source.category)?.label.toLowerCase()})` : ""} · {source.meal}</small>
                    </span>
                    <button type="button" className="icon-button" onClick={() => removeDrink(source.mealId, source.index)} aria-label={`Retirer ${source.name} de l'hydratation`}><Icon name="close" size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="water-amounts">
              {waterAmounts.map((amount) => (
                <button key={amount.ml} onClick={() => addWater(amount.ml)} aria-label={`Ajouter ${amount.ml} ml d'eau`}>
                  <strong>+{amount.ml} ml</strong>
                  <small>{amount.label}</small>
                </button>
              ))}
            </div>
            <form className="water-custom" onSubmit={addCustomWater}>
              {data.customWater && !waterAmounts.some((amount) => amount.ml === data.customWater) && (
                <button type="button" className="water-saved" onClick={() => addWater(data.customWater!)} aria-label={`Ajouter ${data.customWater} ml d'eau`}>
                  <strong>+{data.customWater} ml</strong><small>mon montant</small>
                </button>
              )}
              <input value={waterDraft} onChange={(e) => setWaterDraft(e.target.value)} inputMode="numeric" placeholder="Autre : … ml" aria-label="Montant d'eau personnalisé en ml" />
              <button type="submit" className="plan-confirm" disabled={!waterDraft.trim()}><Icon name="plus" size={14} /> Ajouter</button>
            </form>
          </section>

          <section className="section-block meals">
            <div className="section-title">
              <div>
                <p className="eyebrow">Journal</p>
                <h2>Repas du jour</h2>
              </div>
              <button className="add-button" onClick={() => openMealForm()}><Icon name="plus" size={17} /> Ajouter</button>
            </div>
            <div className="photo-meal-row">
              <button className="photo-meal-card" onClick={() => photoInput.current?.click()}>
                <span className="camera-icon"><Icon name="camera" /></span>
                <span>
                  <strong>Photographier mon repas</strong>
                  <small>Reconnaissance du plat sur le téléphone, à vérifier</small>
                </span>
              </button>
              <button className="photo-meal-gallery" onClick={() => galleryInput.current?.click()} aria-label="Choisir une photo dans la galerie">
                <Icon name="image" />
                <small>Galerie</small>
              </button>
            </div>
            <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={takeMealPhoto} />
            <input ref={galleryInput} className="hidden-input" type="file" accept="image/*" onChange={takeMealPhoto} />
            {/* Prévus aujourd'hui : rien n'est compté avant « Mangé ». */}
            {plannedToday.length > 0 && (
              <div className="planned-today">
                <p className="food-section">À confirmer · prévu aujourd'hui</p>
                {plannedToday.map((meal) => (
                  <div className="plan-meal planned" key={meal.id}>
                    <span className="plan-meal-text">
                      <small>{mealCategories.find((item) => item.id === meal.category)?.label} · Prévu</small>
                      <strong>{meal.name}</strong>
                    </span>
                    <em>{meal.calories} kcal</em>
                    <div className="plan-meal-actions">
                      <button type="button" className="plan-confirm" onClick={() => confirmPlanned(meal)}><Icon name="check" size={14} /> Mangé tel quel</button>
                      <button type="button" className="icon-button" onClick={() => editMeal(meal)} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={15} /></button>
                      <button type="button" className="icon-button" onClick={() => deleteMeal(meal)} aria-label={`Annuler ${meal.name}`}><Icon name="close" size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="meal-list">
              {todayMeals.length === 0 && (
                <button className="meal-row empty" onClick={() => openMealForm()}>
                  <span className="meal-icon dinner"><Icon name="plus" /></span>
                  <span><strong>Aucun repas pour l'instant</strong><small>Ajoutez votre premier repas de la journée</small></span>
                  <Icon name="chevron" size={17} />
                </button>
              )}
              {todayMeals.map((meal) => (
                <div className="meal-row editable" key={meal.id} onClick={() => editMeal(meal)}>
                  <span className={`meal-icon ${categoryStyle[meal.category]}`}><Icon name={meal.source === "photo" ? "camera" : meal.source === "recipe" ? "book" : "apple"} /></span>
                  <span><strong>{mealCategories.find((item) => item.id === meal.category)?.label}</strong><small>{meal.name}</small>{meal.carbs !== undefined && <small className="meal-carbs">{meal.carbs} g de glucides</small>}</span>
                  <span className="meal-calories">{meal.free ? <><strong>{freeLabel(meal)}</strong><small>{meal.freeEstimate ? "kcal" : "repas"}</small></> : <><strong>{meal.calories}</strong><small>kcal</small></>}</span>
                  {/* Modifier et supprimer toujours visibles (une erreur se corrige vite) ; partager si le repas a ses aliments. */}
                  <span className="meal-actions">
                    <button className="icon-button" onClick={(event) => { event.stopPropagation(); editMeal(meal); }} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={16} /></button>
                    {meal.items?.length ? <button className="icon-button" onClick={(event) => { event.stopPropagation(); shareMeal(meal); }} aria-label={`Partager ${meal.name}`}><Icon name="share" size={16} /></button> : null}
                    <button className="icon-button" onClick={(event) => { event.stopPropagation(); deleteMeal(meal); }} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={16} /></button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "Activité" && <ActivityTab data={data} update={update} flash={flash} />}

      {activeTab === "Suivi" && (
        <TrackingTab
          view={trackingView}
          onView={setTrackingView}
          data={data}
          update={update}
          target={goal}
          goal={plan.goal}
          waterGoal={goalWater}
          proteinGoal={result.macros.protein}
          onAddMeal={openMealForm}
          onSaveWeight={saveWeight}
          onDeleteWeight={deleteWeight}
          onEditMeal={editMeal}
          onShareMeal={shareMeal}
          onPlanMeal={(date) => openMealForm(date, true)}
          onRecap={() => setModal("recap")}
          flash={flash}
        />
      )}

      {activeTab === "Profil" && (
        <div className="content page-content">
          <section className="identity-card">
            <button className="identity-avatar" onClick={() => avatarInput.current?.click()} aria-label="Changer ma photo de profil">
              {avatar}
              <span className="photo-picker-badge"><Icon name="camera" size={14} /></span>
            </button>
            <input ref={avatarInput} className="hidden-input" type="file" accept="image/*" onChange={changeAvatar} />
            {editingIdentity ? (
              <form className="identity-form" onSubmit={saveIdentity}>
                <label>Prénom<input name="firstName" defaultValue={profile.firstName} required /></label>
                <label>Nom<input name="lastName" defaultValue={profile.lastName} required /></label>
                <label>Pseudo<input name="pseudo" defaultValue={profile.pseudo} maxLength={24} required /></label>
                <div className="form-actions">
                  <button type="button" className="ghost-button" onClick={() => setEditingIdentity(false)}>Annuler</button>
                  <button type="submit" className="submit-button">Enregistrer</button>
                </div>
              </form>
            ) : (
              <div className="identity-text">
                <h2>{profile.firstName} {profile.lastName}</h2>
                <p>@{profile.pseudo}</p>
                <div className="identity-actions">
                  <button className="add-button" onClick={() => setEditingIdentity(true)}><Icon name="edit" size={15} /> Modifier</button>
                  {profile.photo && <button className="text-button" onClick={removeAvatar}>Retirer la photo</button>}
                </div>
              </div>
            )}
          </section>


          <section className="section-block" id="mon-objectif">
            <div className="section-title"><div><p className="eyebrow">Objectif</p><h2>Mon objectif et mes besoins</h2></div></div>
            <form className="calculator-card" onSubmit={savePlan} noValidate>
              <PlanEditor value={planDraft} onChange={(draft) => { setPlanDraft(draft); setPlanErrors([]); }} sections={["goal", "body"]} />
              {planErrors.map((error) => <p key={error} className="form-error" role="alert">{error}</p>)}
              <button className="submit-button" type="submit"><Icon name="check" /> Enregistrer mon objectif</button>
            </form>

            <PlanResults result={previewResult} body={preview.body} goal={preview.plan.goal} targetWeight={preview.plan.targetWeight} />

            <section className="observed-card">
              <span className="metric-icon"><Icon name="chart" /></span>
              <div>
                <p className="eyebrow">Besoin réel mesuré</p>
                {observed.ready ? (
                  <>
                    <p>
                      D'après vos repas et pesées des {observed.days} derniers jours ({observed.loggedDays} jours notés), votre poids évolue de {observed.weeklyChange > 0 ? "+" : "−"}{Math.abs(observed.weeklyChange).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg par semaine : votre besoin d'entretien réel est d'environ <strong>{observed.maintenance.toLocaleString("fr-FR")} kcal</strong>.
                    </p>
                    {plan.customMaintenance
                      ? <button className="text-button" onClick={() => applyObserved(null)}>Revenir à la formule</button>
                      : <button className="add-button" onClick={() => applyObserved(observed.maintenance)}><Icon name="check" size={15} /> Utiliser cette valeur</button>}
                  </>
                ) : (
                  <p>{observed.reason} Notez vos repas et pesez-vous chaque semaine : l'app calculera votre besoin réel, plus fiable que n'importe quelle formule.</p>
                )}
              </div>
            </section>
            <p className="health-note">Ces estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.</p>
          </section>

          <section className="theme-settings">
            <div className="section-title">
              <div><p className="eyebrow">Apparence</p><h2>Choisir un thème</h2></div>
              <span className="current-theme">{themes.find((item) => item.id === theme)?.name}</span>
            </div>
            <p className="theme-description">Personnalisez les couleurs de l’application. Votre choix est conservé sur cet appareil.</p>
            <div className="theme-grid">
              {themes.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`theme-option theme-${item.id} ${theme === item.id ? "selected" : ""}`}
                  onClick={() => update((current) => ({ ...current, theme: item.id }))}
                  aria-pressed={theme === item.id}
                >
                  <span className="theme-preview"><i /><i /><i /></span>
                  <span><strong>{item.name}</strong><small>{item.mode}</small></span>
                  <i className="theme-check">{theme === item.id && <Icon name="check" size={12} />}</i>
                </button>
              ))}
            </div>
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Hydratation</p><h2>Ce qui compte</h2></div></div>
            <p className="theme-description">Part du volume d'une boisson comptée comme hydratation. Le volume bu reste affiché en entier ; l'eau ajoutée à la main compte toujours à 100 %.</p>
            <div className="coefficient-list">
              {drinkCategories.map((category) => {
                const value = data.hydrationCoefficients?.[category.id] ?? category.coefficient;
                return (
                  <label key={category.id}>
                    <span>{category.label}</span>
                    <div><input type="number" inputMode="numeric" min="0" max="100" value={value} onChange={(e) => update((current) => ({ ...current, hydrationCoefficients: { ...current.hydrationCoefficients, [category.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))} /><small>%</small></div>
                  </label>
                );
              })}
            </div>
            {data.hydrationCoefficients && <button type="button" className="text-button" onClick={() => update((current) => ({ ...current, hydrationCoefficients: undefined }))}>Revenir aux valeurs conseillées</button>}
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Notifications</p><h2>Rappels</h2></div></div>
            <ReminderSettings value={data.reminders} onChange={(reminders) => update((current) => ({ ...current, reminders }))} flash={flash} />
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Conseils</p><h2>Conseil du jour</h2></div></div>
            <label className="planned-toggle">
              <input type="checkbox" checked={data.tips?.splash !== false} onChange={(e) => update((current) => ({ ...current, tips: { ...current.tips, splash: e.target.checked ? undefined : false } }))} />
              <span>Afficher le conseil du jour à la première ouverture de la journée (il reste affiché jusqu'à ce que tu le fermes)</span>
            </label>
            <button type="button" className="text-button" onClick={() => setModal("tips")}>Ouvrir le coin des conseils ›</button>
            {favoriteTips.length > 0 ? (
              <ul className="favorite-tips">
                {tips.filter((tip) => favoriteTips.includes(tip.id)).map((tip) => (
                  <li key={tip.id}>
                    <span><small>{tipThemes[tip.theme]}</small>{tip.text}</span>
                    <button type="button" className="icon-button" onClick={() => toggleFavoriteTip(tip.id)} aria-label="Retirer des favoris"><Icon name="close" size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="theme-description">Touche ☆ sur un conseil pour le retrouver ici. {tips.length} conseils, un par jour.</p>}
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Saisie</p><h2>Repas en cours</h2></div></div>
            <p className="theme-description">Un repas commencé puis laissé de côté est gardé, un par moment de la journée (petit-déjeuner, déjeuner, dîner, collation), et proposé à la réouverture pendant :</p>
            <div className="container-chips" role="radiogroup" aria-label="Durée de conservation des brouillons">
              {DRAFT_HOURS.map((hours) => {
                const selected = (data.draftHours ?? 24) === hours;
                return (
                  <button type="button" role="radio" aria-checked={selected} key={hours} className={selected ? "selected" : ""} onClick={() => update((current) => ({ ...current, draftHours: hours === 24 ? undefined : hours }))}>
                    {hours < 48 ? `${hours} h` : hours === 168 ? "1 semaine" : `${hours / 24} jours`}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Confidentialité</p><h2>Mes données</h2></div></div>
            <p className="theme-description">Tout est enregistré uniquement sur cet appareil. Désinstaller l'application efface les données : exportez une sauvegarde régulièrement.</p>
            <div className="settings-list">
              <button onClick={runExport}><Icon name="download" /><span><strong>Exporter une sauvegarde</strong><small>Fichier à garder ou à partager</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={() => backupInput.current?.click()}><Icon name="upload" /><span><strong>Importer une sauvegarde</strong><small>Remplace les données actuelles</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={() => setModal("pin")}><Icon name="edit" /><span><strong>Changer mon code</strong><small>Nouveau code à 4 chiffres</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={onLock}><Icon name="lock" /><span><strong>Verrouiller maintenant</strong><small>Le code sera demandé</small></span><Icon name="chevron" size={17} /></button>
              <button className="danger" onClick={reset}><Icon name="trash" /><span><strong>Effacer toutes les données</strong><small>Action définitive</small></span><Icon name="chevron" size={17} /></button>
            </div>
            <input ref={backupInput} className="hidden-input" type="file" accept="application/json,.json" onChange={importBackup} />
          </section>
        </div>
      )}

      {activeTab === "Recettes" && <RecipesTab recipes={data.recipes} meals={data.meals} prefill={prefillRecipe} onPrefillUsed={() => setPrefillRecipe(null)} update={update} onAddToJournal={addRecipeToJournal} flash={flash} onReceive={openShareImport} focusRecipeId={focusRecipeId} />}

      {notice && <div className="toast" role="status">{notice}</div>}

      <nav className="bottom-nav" aria-label="Navigation principale">
        {([
          { label: "Accueil", icon: "home" },
          { label: "Suivi", icon: "calendar" },
          { label: "Ajouter", icon: "plus" },
          { label: "Activité", icon: "shoe" },
          { label: "Recettes", icon: "book" },
        ] as { label: Tab | "Ajouter"; icon: IconName }[]).map((item) => (
          <button
            key={item.label}
            className={`${activeTab === item.label ? "active" : ""} ${item.label === "Ajouter" ? "primary-action" : ""}`}
            onClick={() => (item.label === "Ajouter" ? setModal("add") : setActiveTab(item.label))}
            aria-label={item.label}
            aria-current={activeTab === item.label ? "page" : undefined}
          >
            <span><Icon name={item.icon} size={item.label === "Ajouter" ? 24 : 21} /></span>
            {item.label !== "Ajouter" && <small>{item.label}</small>}
          </button>
        ))}
      </nav>

      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-handle" />
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Fermer"><Icon name="close" /></button>
            {modal === "portion" && mealRecipe && (
              <>
                <p className="eyebrow">Ajouter à mes repas</p>
                <h2>{mealRecipe.name}</h2>
                <RecipePortionPicker recipe={mealRecipe} category={defaultCategory()} onSave={saveRecipePortion} />
              </>
            )}
            {modal === "meal" && (
              <>
                <p className="eyebrow">Journal alimentaire</p>
                <h2>{editingMeal ? "Modifier le repas" : "Ajouter un repas"}</h2>
                <MealComposer
                  key={`${editingMeal?.id ?? "nouveau"}-${composerKey}`}
                  editing={editingMeal ?? undefined}
                  draft={restoredDraft ?? undefined}
                  draftNotice={sharedMealNotice}
                  onDraft={(draft) => mealDraft.save(draft, true)}
                  onDiscardDraft={() => { const shown = restoredDraft ?? offeredDraft; if (shown) mealDraft.discard(shown); mealDraft.clear(); setRestoredDraft(null); setOfferedDraft(null); setComposerKey((value) => value + 1); }}
                  offeredDraft={offeredDraft ?? undefined}
                  onResumeDraft={() => { if (offeredDraft) mealDraft.resume(offeredDraft); setRestoredDraft(offeredDraft); setOfferedDraft(null); setComposerKey((value) => value + 1); }}
                  initialPhoto={mealPhoto ?? undefined}
                  planned={planning}
                  initialItems={mealRecipe ? [toMealItem(recipeResult(mealRecipe))] : undefined}
                  date={mealDate}
                  category={defaultCategory()}
                  recipes={data.recipes}
                  customFoods={data.customFoods}
                  meals={data.meals}
                  onSave={saveMeal}
                  leftovers={freshLeftovers}
                  onDiscardLeftover={discardLeftover}
                  onCreateFood={(food) => update((current) => ({ ...current, customFoods: [...current.customFoods, food] }))}
                />
              </>
            )}
            {modal === "add" && (
              <>
                <p className="eyebrow">Nouvelle entrée</p>
                <h2>Que souhaitez-vous ajouter ?</h2>
                <div className="choice-list">
                  <button onClick={() => openMealForm()}><span className="meal-icon breakfast"><Icon name="apple" /></span><span><strong>Un repas</strong><small>Suivre les calories consommées</small></span><Icon name="chevron" /></button>
                  <button onClick={() => setModal("weigh")}><span className="meal-icon dinner"><Icon name="scale" /></span><span><strong>Une pesée</strong><small>Pesée rapide, le dernier poids pré-rempli</small></span><Icon name="chevron" /></button>
                  <button onClick={() => goTo("Activité")}><span className="meal-icon mint-icon"><Icon name="shoe" /></span><span><strong>Une séance de sport</strong><small>Marche, course, musculation, yoga…</small></span><Icon name="chevron" /></button>
                  <button onClick={openShareImport}><span className="meal-icon lunch"><Icon name="link" /></span><span><strong>Un partage reçu</strong><small>Recette, assiette ou repas envoyé par un ami</small></span><Icon name="chevron" /></button>
                </div>
              </>
            )}
            {modal === "recap" && (
              <>
                <p className="eyebrow">Mon suivi</p>
                <h2>Télécharger un récap</h2>
                <RecapDownload data={data} target={goal} person={displayName} flash={flash} />
              </>
            )}
            {modal === "tips" && (
              <>
                <p className="eyebrow">{tips.length} conseils, un par jour</p>
                <h2>Coin des conseils</h2>
                <TipsCorner count={tipCount} favorites={favoriteTips} onToggleFavorite={toggleFavoriteTip} />
              </>
            )}
            {modal === "weigh" && (
              <>
                <p className="eyebrow">Pesée rapide</p>
                <h2>Mon poids aujourd'hui</h2>
                <QuickWeigh weights={data.weights} onSave={(date, kg) => { saveWeight(date, kg); setModal(null); flash(`Pesée enregistrée : ${kg.toLocaleString("fr-FR")} kg`); }} onOpenTracking={goToWeight} />
              </>
            )}
            {modal === "share-out" && outgoingShare && (
              <>
                <p className="eyebrow">Partage</p>
                <h2>Envoyer ce repas</h2>
                <p className="theme-description">La personne le verra en aperçu, puis choisira le jour, le moment et ses propres quantités avant de l'ajouter.</p>
                <ShareSheet payload={outgoingShare} onClose={() => setModal(null)} />
              </>
            )}
            {modal === "share" && (
              <>
                <p className="eyebrow">Partage</p>
                <h2>Recevoir un partage</h2>
                <ShareImport
                  key={shareText ?? "vide"}
                  recipes={data.recipes}
                  initialText={shareText}
                  onAddRecipe={addSharedRecipe}
                  onOpenMeal={openSharedMeal}
                  onSaveAsRecipe={(meal) => { setModal(null); setPrefillRecipe(recipeFromMeal(meal)); goTo("Recettes"); }}
                  onOpenRecipe={(recipe) => focusRecipe(recipe.id)}
                  onClose={() => setModal(null)}
                />
              </>
            )}
            {modal === "steps" && (
              <>
                <p className="eyebrow">Activité</p>
                <h2>Mes pas</h2>
                <StepsPanel data={data} update={update} onSync={syncSteps} flash={flash} />
              </>
            )}
            {modal === "pin" && (
              <ChangePin
                current={data.pin}
                onSave={(pin) => { update((current) => ({ ...current, pin })); setModal(null); flash("Code modifié"); }}
              />
            )}
          </section>
        </div>
      )}
    </CorrectionsContext.Provider>
  );
}

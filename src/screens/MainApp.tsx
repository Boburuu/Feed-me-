import { Fragment, useEffect, useRef, useState } from "react";
import ActivityTab from "../components/ActivityTab";
import ChangePin from "../components/ChangePin";
import ShareAppPanel from "../components/ShareAppPanel";
import EraseConfirm from "../components/EraseConfirm";
import DayStrip from "../components/DayStrip";
import FitNumber from "../components/FitNumber";
import StoredImage from "../components/StoredImage";
import FastingCard from "../components/FastingCard";
import MealComposer, { type MealExtras } from "../components/MealComposer";
import GoalCard from "../components/GoalCard";
import Icon, { type IconName } from "../components/Icon";
import PlanEditor from "../components/PlanEditor";
import PlanResults from "../components/PlanResults";
import RecipePortionPicker from "../components/RecipePortionPicker";
import RecipesTab from "../components/RecipesTab";
import PantryPanel from "../components/PantryPanel";
import QuickWeigh from "../components/QuickWeigh";
import ReminderSettings from "../components/ReminderSettings";
import { REMINDER_EVENT, syncReminders, takeReminderTarget, type ReminderTarget } from "../lib/reminders";
import ShareImport from "../components/ShareImport";
import { ackPayload, freeName, mealPayload, recipeConflict, shareInHash, type SharedMeal, type SharedPlanned, type SharedRecipe, type SharePayload, type ShoppingShareLine } from "../lib/share";
import { addNames, cleanName, joinNames, newShareId, sameName } from "../lib/tablee";
import { TableeContext, type TableeApi } from "../lib/tableeContext";
import ShareSheet from "../components/ShareSheet";
import { INCOMING_EVENT, takeIncomingShare } from "../lib/incomingShare";
import { cleanMealName, eatenItems, recipeFromMeal } from "../lib/sharedMeal";
import { freeLabel } from "../lib/freeDays";
import { shortVersion, versionLabel } from "../lib/version";
import type { MealItem } from "../lib/storage";
import StepsPanel from "../components/StepsPanel";
import TrackingTab, { type TrackingView } from "../components/TrackingTab";
import { exportBackup } from "../lib/backup";
import { backfillCarbs, backfillExtras } from "../lib/carbsBackfill";
import { correctPastMeals, mealsWithProduct } from "../lib/corrections";
import { CorrectionsContext, type CorrectionsApi } from "../lib/correctionsContext";
import { DRAFT_HOURS, hasContent, lastTab, mealDraft, setDraftHours, type MealDraft } from "../lib/drafts";
import { goals, programFor } from "../lib/goals";
import { tipAt, tips, tipThemes } from "../lib/tips";
import TipSplash from "../components/TipSplash";
import TipsCorner from "../components/TipsCorner";
import RecapDownload from "../components/RecapDownload";
import { restoreImages } from "../lib/images";
import { readPhoneSteps, readSteps } from "../lib/steps";
import { recipeResult, toMealItem } from "../lib/foods";
import { drinkCategories, hydrationOf } from "../lib/hydration";
import { confirmEaten, eatenMeals, isPlanned } from "../lib/planning";
import EatenWhen, { dayLabel } from "../components/EatenWhen";
import { sessionTypes } from "../lib/activity";
import { canCheckUpdate, checkUpdate, markWhatsNewSeen, pendingWhatsNew, UPDATE_URL } from "../lib/appUpdate";
import WhatsNew from "../components/WhatsNew";
import { HOME_MEAL_ORDER, mealGlyph, mealImageId } from "../lib/mealVisual";
import UpdatePrompt from "../components/UpdatePrompt";
import { formatWater, WATER_MAX, waterAmounts, waterGoal } from "../lib/water";
import { bmi, computePlan, observedMaintenance } from "../lib/nutrition";
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
type SettingsPage = "compte" | "objectif" | "apparence" | "hydratation" | "rappels" | "conseils" | "brouillons" | "tablee" | "donnees" | "partager";
type ModalType = "meal" | "portion" | "add" | "pin" | "steps" | "share" | "share-out" | "weigh" | "tips" | "recap" | "pantry" | null;

function defaultCategory(date = new Date()): MealCategory {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 10.5) return "petit-dejeuner";
  if (hour < 15) return "dejeuner";
  if (hour < 18) return "collation";
  return "diner";
}

const RING_LENGTH = 2 * Math.PI * 43;

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
      else if (target === "prevu" || target === "accueil") goTo("Accueil");
      else if (target === "eau") goTo("Accueil", "eau");
      else if (target === "repas") openMealForm();
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
  /** Destinataires déjà choisis (« Mangé avec » du repas partagé). */
  const [outgoingGuests, setOutgoingGuests] = useState<string[]>([]);
  const [outgoingId, setOutgoingId] = useState<string | undefined>(undefined);
  const openShare = (payload: SharePayload, guests: string[] = [], id?: string) => { setOutgoingShare(payload); setOutgoingGuests(guests); setOutgoingId(id); setModal("share-out"); };
  /** Repas partagé : son lien garde le même identifiant, pour y rattacher les retours. */
  const shareMeal = (meal: Meal) => {
    const id = meal.shareId ?? newShareId();
    if (!meal.shareId) update((current) => ({ ...current, meals: current.meals.map((item) => (item.id === meal.id ? { ...item, shareId: id } : item)) }));
    openShare(mealPayload(meal), meal.with ?? [], id);
  };
  /** Plat reçu par lien : après l'avoir noté, on propose de prévenir la personne qui a cuisiné. */
  const [pendingAck, setPendingAck] = useState<{ id: string; from: string; name: string } | null>(null);
  /** Retour reçu : noté sur le repas d'origine (« Alex : 1 part · 412 kcal »). */
  const addAck = (share: string, by: string, part: string) => {
    const meal = data.meals.find((item) => item.shareId === share);
    setModal(null);
    if (!meal) { flash("Repas introuvable sur ce téléphone : il a peut-être été supprimé."); return; }
    update((current) => ({ ...current, meals: current.meals.map((item) => (item.shareId === share ? { ...item, acks: { ...item.acks, [by]: part } } : item)) }));
    flash(`Noté : ${by} a pris ${part}`);
  };
  /** Repas prévus reçus : ajoutés au planning, « prévus » (rien ne compte avant « Mangé »). */
  const addSharedPlanned = (meals: SharedPlanned[], companions: string[]) => {
    const start = Date.now();
    update((current) => ({ ...current, meals: [...current.meals, ...meals.map((meal, index): Meal => ({ ...meal, id: start + index, status: "planned", source: "manual", ...(companions.length ? { with: companions } : {}) }))] }));
    setModal(null);
    flash(`${meals.length} repas prévu${meals.length > 1 ? "s" : ""} ajouté${meals.length > 1 ? "s" : ""} : Suivi › Semaine`);
  };
  /** Articles reçus : ajoutés à la liste de courses (sans doublon). */
  const addSharedShopping = (lines: ShoppingShareLine[]) => {
    const texts = lines.map((line) => (line.qty ? `${line.name} · ${line.qty}` : line.name));
    update((current) => {
      const shopping = current.shopping ?? { checked: [], extras: [] };
      const fresh = texts.filter((text) => !shopping.extras.some((item) => item.text === text && !item.done));
      return { ...current, shopping: { ...shopping, extras: [...shopping.extras, ...fresh.map((text, index) => ({ id: Date.now() + index, text, done: false }))] } };
    });
    setModal(null);
    flash(`${texts.length} article${texts.length > 1 ? "s" : ""} ajouté${texts.length > 1 ? "s" : ""} à ta liste de courses`);
  };
  /** Recettes d'un carnet reçu : déjà présentes ignorées, même nom renommé « (2) ». */
  const addSharedRecipes = (shared: SharedRecipe[]) => {
    update((current) => {
      const recipes = [...current.recipes];
      const start = Date.now();
      shared.forEach((recipe, index) => {
        const conflict = recipeConflict(recipes, recipe);
        if (conflict?.kind === "same") return;
        recipes.push({ ...recipe, name: conflict ? freeName(recipes, recipe.name) : recipe.name, id: start + index });
      });
      return { ...current, recipes };
    });
    setModal(null);
    flash("Carnet reçu : ce que tu as coché est ajouté");
    goTo("Recettes");
  };
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
  const openSharedMeal = (meal: SharedMeal & { items: MealItem[] }, as: "meal" | "plate" = meal.plate ? "plate" : "meal", companions: string[] = [], source?: { id: string; from: string }) => {
    setPendingAck(source ? { ...source, name: cleanMealName(meal.name) } : null);
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
      ...(companions.length ? { with: companions } : {}),
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
  /** Section ouverte de la page Mon objectif. */
  const [objectiveSection, setObjectiveSection] = useState("goal");
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
  const [homeDay, setHomeDay] = useState(today);
  /** Nouvelle version publiée, cherchée une fois à l'ouverture. */
  const [updateTag, setUpdateTag] = useState<string | null>(null);
  const [updatePrompt, setUpdatePrompt] = useState(false);
  const [updateNotes, setUpdateNotes] = useState<string[]>([]);
  const [newNotes, setNewNotes] = useState(pendingWhatsNew);
  const [updateChecking, setUpdateChecking] = useState(false);
  // Une seule vérification à l'ouverture ; ensuite, à la demande depuis les paramètres.
  useEffect(() => {
    if (!canCheckUpdate()) return;
    let alive = true;
    checkUpdate().then((check) => { if (alive && check.status === "new") { setUpdateTag(check.tag); setUpdateNotes(check.notes); setUpdatePrompt(true); } }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const todayMeals = eatenMeals(data.meals).filter((meal) => meal.date === homeDay);
  // Prévus aujourd'hui, et prévus les jours passés jamais validés (repas préparés à l'avance).
  const plannedToday = data.meals.filter((meal) => (homeDay === today ? meal.date <= today : meal.date === homeDay) && isPlanned(meal)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const [askingEaten, setAskingEaten] = useState<number | null>(null);
  const consumed = todayMeals.reduce((sum, meal) => sum + meal.calories, 0);
  const proteinToday = todayMeals.reduce((sum, meal) => sum + (meal.protein ?? 0), 0);
  const carbsToday = todayMeals.reduce((sum, meal) => sum + (meal.carbs ?? 0), 0);
  const fatToday = todayMeals.reduce((sum, meal) => sum + (meal.fat ?? 0), 0);
  const sessionsToday = data.sessions.filter((session) => session.date === homeDay);
  const mealImage = (meal: Meal) => mealImageId(meal, data.recipes);
  const observed = observedMaintenance(eatenMeals(data.meals), data.weights, today);

  // Aperçu en direct pendant la saisie ; la valeur enregistrée sinon.
  const draftValid = !bodyErrors(planDraft).length && !goalErrors(planDraft).length;
  const preview = draftValid ? parseDraft(planDraft) : { body: profile, plan };
  const previewResult = draftValid ? computePlan(preview.body, { ...preview.plan, customMaintenance: plan.customMaintenance }) : result;
  const remaining = goal - consumed;
  const progress = Math.round((consumed / goal) * 100);
  const water = data.water[homeDay] ?? 0;
  // Eau ajoutée ici + boissons des repas du jour (calculées, jamais recopiées).
  const hydration = hydrationOf(data, homeDay);
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
    pantry: data.pantry ?? [],
    savePantry: (item) => update((current) => {
      const list = current.pantry ?? [];
      return { ...current, pantry: list.some((entry) => entry.pantryId === item.pantryId) ? list.map((entry) => (entry.pantryId === item.pantryId ? item : entry)) : [item, ...list] };
    }),
    removePantry: (id) => update((current) => ({ ...current, pantry: (current.pantry ?? []).filter((entry) => entry.pantryId !== id) })),
    images: data.productImages ?? {},
    saveImage: (key, image) => update((current) => {
      const images = { ...current.productImages };
      if (image) images[key] = image; else delete images[key];
      return { ...current, productImages: images };
    }),
  };
  const goalWater = waterGoal(profile.sex);
  const stepsToday = data.steps[homeDay];
  const latestWeight = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const displayName = profile.pseudo || profile.firstName;
  const dateLabel = new Date(activeTab === "Accueil" ? `${homeDay}T12:00:00` : Date.now()).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const searchUpdate = async () => {
    if (updateChecking) return;
    setUpdateChecking(true);
    const check = await checkUpdate();
    setUpdateChecking(false);
    if (check.status === "new") { setUpdateTag(check.tag); setUpdateNotes(check.notes); setUpdatePrompt(true); }
    else if (check.status === "latest") { setUpdateTag(null); flash("Tu as déjà la dernière version"); }
    else flash("Recherche impossible : vérifie ta connexion");
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

  const saveMeal = (saved: Omit<Meal, "id">, extras: MealExtras) => {
    // Repas mangé à plusieurs : on propose tout de suite d'envoyer leur part (lien rattaché au repas).
    const ackNow = !editingMeal && !saved.free && !!pendingAck;
    const shareNow = !ackNow && !editingMeal && !saved.free && !!saved.with?.length && !!saved.items?.length;
    const shareId = shareNow ? newShareId() : undefined;
    const meal = shareId ? { ...saved, shareId } : saved;
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
    if (ackNow && pendingAck) {
      // Plat reçu par lien : on propose de dire à la personne qui a cuisiné ce qu'on a pris.
      const parts = meal.plate ? Math.round(meal.plate.share * meal.plate.servings * 2) / 2 : 0;
      const part = `${parts ? `${parts.toLocaleString("fr-FR")} part${parts > 1 ? "s" : ""} · ` : ""}${meal.calories} kcal`;
      openShare(ackPayload({ share: pendingAck.id, name: pendingAck.name, part }), [pendingAck.from]);
      setPendingAck(null);
    } else if (shareNow) openShare(mealPayload({ ...meal, id: 0 }), meal.with, shareId);
    else setModal(null);
    flash(meal.free ? `Cheat day noté : ce jour sort de tes moyennes` : editingMeal ? `Repas modifié · ${meal.calories} kcal` : extras.leftover ? `Ma part : ${meal.calories} kcal · reste gardé` : `Repas enregistré · ${meal.calories} kcal`);
  };

  /** Repas prévu confirmé « mangé tel quel » : il compte à partir de maintenant. */
  const confirmPlanned = (meal: Meal, date = meal.date) => {
    update((current) => ({ ...current, meals: confirmEaten(current.meals, meal.id, date) }));
    setAskingEaten(null);
    flash(`Mangé ${date === today ? "aujourd'hui" : `le ${dayLabel(date)}`} · ${meal.calories} kcal`);
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
  /** « + › Un cheat day » : le formulaire s'ouvre directement sur le cheat day. */
  const [cheatStart, setCheatStart] = useState(false);
  useEffect(() => { if (modal !== "meal") setCheatStart(false); }, [modal]);
  const openCheatDay = (date = today) => {
    setPendingAck(null);
    setPlanning(false);
    setRestoredDraft(null);
    setOfferedDraft(null);
    setMealDate(date);
    setCheatStart(true);
    setComposerKey((value) => value + 1);
    setModal("meal");
  };
  /** Moment choisi depuis une ligne de l'accueil ; sinon celui de l'heure. */
  const [composerCategory, setComposerCategory] = useState<MealCategory | null>(null);
  const openMealForm = (date = today, planned = false, category: MealCategory | null = null) => {
    setComposerCategory(category);
    setPendingAck(null);
    setCheatStart(false);
    setPlanning(planned);
    // Brouillon du moment de repas en cours (dîner le soir…), sinon le plus récent.
    const drafts = mealDraft.all().filter((entry) => !entry.editingId && hasContent(entry));
    const draft = drafts.find((entry) => entry.category === (category ?? defaultCategory())) ?? (category ? null : drafts[0] ?? null);
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
    update((current) => ({ ...current, water: { ...current.water, [homeDay]: Math.max(0, Math.min(WATER_MAX, (current.water[homeDay] ?? 0) + ml)) } }));
  };

  /** Photo prise depuis l'accueil : la fenêtre d'ajout de repas l'analyse à l'ouverture. */
  const takeMealPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMealPhoto(file);
    openMealForm(homeDay, homeDay > today);
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

  /** Effacer tout : panneau dans la page (EFFACER + code), plus de simple confirmation. */
  const [erasing, setErasing] = useState(false);

  const [trackingView, setTrackingView] = useState<TrackingView>("jour");
  /** Page ouverte dans le profil (null : la liste des réglages). */
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [settingsQuery, setSettingsQuery] = useState("");
  /** Onglet quitté pour le profil : le retour y ramène. */
  const [tabBeforeProfile, setTabBeforeProfile] = useState<Tab>("Accueil");
  const openProfile = () => { if (activeTab !== "Profil") setTabBeforeProfile(activeTab); goTo("Profil"); };
  const goTo = (tab: Tab, section?: string) => {
    setModal(null);
    setSettingsPage(null);
    setSettingsQuery("");
    setActiveTab(tab);
    // Suivi : le bilan et le poids ont chacun leur onglet.
    if (tab === "Suivi") setTrackingView(section === "bilan-semaine" ? "bilan" : section === "suivi-poids" ? "poids" : section === "semaine" ? "semaine" : "jour");
    window.setTimeout(() => (section ? document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }) : window.scrollTo(0, 0)), 50);
  };
  const goToProfile = (section: "mon-objectif") => { goTo("Profil"); setSettingsPage(section === "mon-objectif" ? "objectif" : null); };
  const goToWeight = () => goTo("Suivi", "suivi-poids");

  const avatar = (
    <>{profile.photo ? <img src={profile.photo} alt="" /> : <span>{initials(profile)}</span>}</>
  );

  const tableeApi: TableeApi = {
    myName: cleanName(profile.firstName || profile.pseudo),
    me: [profile.firstName, profile.pseudo],
    tablee: data.tablee ?? [],
    addToTablee: (names) => update((current) => ({ ...current, tablee: addNames(current.tablee ?? [], names) })),
    removeFromTablee: (name) => update((current) => ({ ...current, tablee: (current.tablee ?? []).filter((entry) => !sameName(entry, name)) })),
    received: data.receivedShares ?? [],
    markReceived: (id) => update((current) => ({ ...current, receivedShares: [...(current.receivedShares ?? []).filter((entry) => entry !== id), id].slice(-200) })),
  };
  const [tableeDraft, setTableeDraft] = useState("");

  return (
    <CorrectionsContext.Provider value={correctionsApi}>
    <TableeContext.Provider value={tableeApi}>
      {updatePrompt && updateTag && <UpdatePrompt version={updateTag} notes={updateNotes} onClose={() => setUpdatePrompt(false)} />}
      {!updatePrompt && newNotes && <WhatsNew version={__APP_VERSION__.tag} notes={newNotes} onClose={() => { markWhatsNewSeen(); setNewNotes(null); }} />}
      {showSplash && modal === null && (
        <TipSplash tip={todayTip} favorite={favoriteTips.includes(todayTip.id)} onToggleFavorite={() => toggleFavoriteTip(todayTip.id)} onClose={() => setShowSplash(false)} onOpenCorner={() => { setShowSplash(false); setModal("tips"); }} onNext={nextTip} />
      )}
      <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={takeMealPhoto} />
      <input ref={galleryInput} className="hidden-input" type="file" accept="image/*" onChange={takeMealPhoto} />
      <header className="topbar">
        <div>
          <p className="eyebrow">{dateLabel}<span className="version-tag" title={versionLabel()}>{shortVersion()}</span></p>
          <h1>{activeTab === "Suivi" || activeTab === "Activité" || activeTab === "Recettes" ? activeTab : `Bonjour, ${displayName}`}</h1>
        </div>
        <span className="topbar-actions">
        {activeTab === "Suivi" && <button type="button" className="round-button soft" onClick={() => setModal("recap")} aria-label="Télécharger mon bilan en PDF"><Icon name="file" size={20} /></button>}
        <button className={activeTab === "Profil" ? "avatar active" : "avatar"} onClick={openProfile} aria-label="Ouvrir mon profil">
          {avatar}
        </button>
        </span>
      </header>

      {activeTab === "Accueil" && (
        <div className="content home-content">
          <DayStrip meals={data.meals} goal={goal} today={today} selected={homeDay} onSelect={setHomeDay} />

          <section className="hc">
            <button type="button" className="hc-g" onClick={() => goTo("Suivi")} aria-label="Voir le détail de la journée">
              <span className={remaining < 0 ? "kr over" : "kr"}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <defs><linearGradient id="kr-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--ring-a)" /><stop offset="1" stopColor="var(--ring-b)" /></linearGradient></defs>
                  <circle className="kr-t" cx="50" cy="50" r="43" />
                  <circle className="kr-p" cx="50" cy="50" r="43" transform="rotate(-90 50 50)" strokeDasharray={`${Math.min(1, consumed / goal) * RING_LENGTH} ${RING_LENGTH}`} />
                </svg>
                <span className="kr-c">
                  <FitNumber>{`${remaining < 0 ? "+" : ""}${Math.abs(remaining).toLocaleString("fr-FR")}`}</FitNumber>
                  <small>{remaining >= 0 ? "kcal restantes" : "kcal au-dessus"}</small>
                </span>
              </span>
              <span className="hc-m">
                {([
                  { id: "p", name: "Protéines", value: proteinToday, target: result.macros.protein },
                  { id: "c", name: "Glucides", value: carbsToday, target: result.macros.carbs },
                  { id: "f", name: "Lipides", value: fatToday, target: result.macros.fat },
                ]).map((macro) => (
                  <span className={`ml ml-${macro.id}`} key={macro.id}>
                    <span className="ml-h"><span>{macro.name}</span><b>{macro.value} g</b></span>
                    <span className="gg"><i style={{ width: `${Math.min(100, macro.target ? (macro.value / macro.target) * 100 : 0)}%` }} /></span>
                    <small>sur {macro.target} g</small>
                  </span>
                ))}
              </span>
            </button>
            <small className="hc-n"><b>{consumed.toLocaleString("fr-FR")}</b> mangées sur {goal.toLocaleString("fr-FR")} · {progress} % du jour</small>
            {todayMeals.some((meal) => meal.free) && <p className="free-day-note">Cheat day : ce jour sort de tes moyennes et de ton bilan.</p>}
          </section>

          <section className="wc" id="eau">
            <div className="wc-h">
              <span className="q-i"><Icon name="water" size={18} /></span>
              <span className="wc-t">
                <b>Eau</b>
                <small>sur {formatWater(goalWater)}</small>
              </span>
              <strong>{formatWater(hydration.totalMl)}</strong>
              <button className="round-button soft" onClick={() => addWater(-lastWater)} disabled={water === 0} aria-label={`Retirer ${lastWater} ml`}>
                <Icon name="minus" size={18} />
              </button>
            </div>
            <span className="gg w"><i style={{ width: `${Math.min(100, (hydration.totalMl / goalWater) * 100)}%` }} /></span>
            {hydration.mealsMl > 0 && <small className="water-split">Eau pure {formatWater(hydration.pureWaterMl)} · boissons des repas {formatWater(hydration.mealsMl)}</small>}
            {hydration.sources.length > 0 && <button type="button" className="text-button water-detail-toggle" onClick={() => setWaterDetail((value) => !value)}>{waterDetail ? "Masquer le détail" : "Voir le détail"}</button>}
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
            <div className="wc-a">
              {waterAmounts.map((amount) => (
                <button key={amount.ml} onClick={() => addWater(amount.ml)} aria-label={`Ajouter ${amount.ml} ml d'eau, ${amount.label}`}>+{amount.ml} ml</button>
              ))}
            </div>
            <form className="wc-c" onSubmit={addCustomWater}>
              {data.customWater && !waterAmounts.some((amount) => amount.ml === data.customWater) && (
                <button type="button" className="wc-s" onClick={() => addWater(data.customWater!)} aria-label={`Ajouter ${data.customWater} ml d'eau`}>
                  +{data.customWater} ml<small>mon montant</small>
                </button>
              )}
              <input value={waterDraft} onChange={(e) => setWaterDraft(e.target.value)} inputMode="numeric" placeholder="Personnalisé : … ml" aria-label="Montant d'eau personnalisé en ml" />
              <button type="submit" className="plan-confirm" disabled={!waterDraft.trim()}><Icon name="plus" size={14} /> Ajouter</button>
            </form>
          </section>

          <div className="q3">
            <button className={sessionsToday.length ? "q q-sport yes" : "q q-sport"} onClick={() => goTo("Activité")} aria-label="Sport : ouvrir l'activité">
              <span className="q-i"><Icon name={sessionsToday.length ? "check" : "flame"} size={18} /></span>
              <strong>{sessionsToday.length ? "Fait" : "Pas encore"}</strong>
              <small>{sessionsToday.length ? `${sessionTypes.find((type) => type.id === sessionsToday[0].type)?.label ?? "Séance"}, ${sessionsToday.reduce((sum, session) => sum + session.minutes, 0)} min` : "Aucune séance"}</small>
            </button>
            <button className="q q-steps" onClick={() => setModal("steps")} aria-label="Pas : noter mes pas">
              <span className="q-i"><Icon name="shoe" size={18} /></span>
              <strong>{stepsToday ? stepsToday.count.toLocaleString("fr-FR") : "—"}</strong>
              <small>{stepsToday ? `pas sur ${data.stepGoal.toLocaleString("fr-FR")}` : "Toucher pour ajouter"}</small>
              <span className="gg"><i style={{ width: `${Math.min(100, ((stepsToday?.count ?? 0) / data.stepGoal) * 100)}%` }} /></span>
            </button>
            <button className="q q-weight" onClick={goToWeight} aria-label="Poids : ouvrir le suivi">
              <span className="q-i"><Icon name="scale" size={18} /></span>
              <strong>{latestWeight ? latestWeight.kg.toLocaleString("fr-FR") : "—"} kg</strong>
              <small>{latestWeight ? `pesée du ${new Date(`${latestWeight.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : "Ajouter une pesée"}</small>
            </button>
          </div>

          {plan.program === "jeune" && <FastingCard fasts={data.fasts} onStart={startFast} onStop={stopFast} />}

          <section className="dash-s">
            <div className="sec">
              <h2>Mes repas</h2>
              <span className="sec-a">
                <button className="round-button soft" onClick={() => photoInput.current?.click()} aria-label="Photographier mon repas"><Icon name="camera" size={20} /></button>
                <button className="round-button soft" onClick={() => galleryInput.current?.click()} aria-label="Choisir une photo dans la galerie"><Icon name="image" size={20} /></button>
                <button className="add-button" onClick={() => openMealForm(homeDay, homeDay > today)}><Icon name="plus" size={17} /> Ajouter</button>
              </span>
            </div>
            <div className="m-list">
              {HOME_MEAL_ORDER.map((category) => {
                const label = mealCategories.find((item) => item.id === category)?.label;
                const eaten = todayMeals.filter((meal) => meal.category === category);
                const planned = plannedToday.filter((meal) => meal.category === category);
                const glyph = <span className={`meal-icon glyph-${category}`}><Icon name={mealGlyph[category]} /></span>;
                if (!eaten.length && !planned.length) {
                  const now = homeDay === today && category === defaultCategory();
                  return (
                    <button className={now ? "mr mr-now" : "mr"} key={category} onClick={() => openMealForm(homeDay, homeDay > today, category)}>
                      {glyph}
                      <span className="m-t"><b>{label}</b><small>{now ? "Qu'as-tu mangé ?" : homeDay > today ? "Prévoir un repas" : "Rien de noté"}</small></span>
                      <span className={now ? "mr-go" : "mr-plus"}><Icon name="plus" size={18} /></span>
                    </button>
                  );
                }
                return (
                  <Fragment key={category}>
                    {eaten.map((meal) => (
                      <div className="mr mr-meal" key={meal.id} onClick={() => editMeal(meal)}>
                        <span className="mr-top">
                          {mealImage(meal) ? <span className="thumb"><StoredImage id={mealImage(meal)!} alt="" /></span> : glyph}
                          <span className="m-t">
                            <b>{label}</b>
                            <small>{meal.name}</small>
                            {meal.with?.length ? <small className="meal-with-line">avec {joinNames(meal.with)}</small> : null}
                            {meal.acks ? <small className="meal-with-line">{Object.entries(meal.acks).map(([name, part]) => `✓ ${name} : ${part}`).join(" · ")}</small> : null}
                            {meal.carbs !== undefined && <small className="meal-carbs">{meal.carbs} g de glucides</small>}
                          </span>
                          <span className="meal-calories">{meal.free ? <><strong>{freeLabel(meal)}</strong><small>{meal.freeEstimate ? "kcal" : "day"}</small></> : <><strong>{meal.calories}</strong><small>kcal</small></>}</span>
                        </span>
                        {/* Modifier et supprimer toujours visibles (une erreur se corrige vite) ; partager si le repas a ses aliments. */}
                        <span className="mr-acts">
                          <button className="icon-button" onClick={(event) => { event.stopPropagation(); editMeal(meal); }} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={16} /></button>
                          {meal.items?.length ? <button className="icon-button" onClick={(event) => { event.stopPropagation(); shareMeal(meal); }} aria-label={`Partager ${meal.name}`}><Icon name="share" size={16} /></button> : null}
                          <button className="icon-button" onClick={(event) => { event.stopPropagation(); deleteMeal(meal); }} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={16} /></button>
                        </span>
                      </div>
                    ))}
                    {/* Prévus aujourd'hui ou oubliés les jours passés : rien n'est compté avant « Mangé ». */}
                    {planned.map((meal) => (
                      <div className="mr mr-plan" key={meal.id}>
                        <span className="mr-top">
                          {mealImage(meal) ? <span className="thumb"><StoredImage id={mealImage(meal)!} alt="" /></span> : glyph}
                          <span className="m-t">
                            <b>{label}</b>
                            <small>{meal.date === today ? "Prévu aujourd'hui" : meal.date > today ? `Prévu ${dayLabel(meal.date)}` : `Prévu ${dayLabel(meal.date)}, pas encore validé`} : {meal.name}</small>
                          </span>
                          <span className="meal-calories"><strong>{meal.calories}</strong><small>kcal</small></span>
                        </span>
                        <span className="mr-acts">
                          {meal.date === today
                            ? <button type="button" className="plan-confirm" onClick={() => confirmPlanned(meal)}><Icon name="check" size={14} /> Mangé tel quel</button>
                            : <button type="button" className="plan-confirm" aria-expanded={askingEaten === meal.id} onClick={() => setAskingEaten(askingEaten === meal.id ? null : meal.id)}><Icon name="check" size={14} /> Mangé</button>}
                          <button type="button" className="icon-button" onClick={() => editMeal(meal)} aria-label={`Modifier ${meal.name}`}><Icon name="edit" size={15} /></button>
                          <button type="button" className="icon-button" onClick={() => deleteMeal(meal)} aria-label={`Annuler ${meal.name}`}><Icon name="close" size={15} /></button>
                        </span>
                        {askingEaten === meal.id && <EatenWhen meal={meal} today={today} onConfirm={(date) => confirmPlanned(meal, date)} />}
                      </div>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </section>

          <section className="dash-s">
            <div className="sec"><h2>Mon objectif</h2></div>
            <GoalCard plan={plan} result={result} currentWeight={latestWeight?.kg ?? profile.weight} height={profile.height} onOpen={() => goToProfile("mon-objectif")} />
          </section>

          <section className="dash-s">
            <div className="sec"><h2>Conseil du jour</h2></div>
            <div className="tip-card">
              <span className="metric-icon"><Icon name="bulb" /></span>
              <div><p className="eyebrow">{tipThemes[todayTip.theme]}</p><p>{todayTip.text}</p><span className="tip-links"><button type="button" className="text-button" onClick={nextTip}>Un autre conseil</button><button type="button" className="text-button" onClick={() => setModal("tips")}>Tous mes conseils ›</button></span></div>
              <button type="button" className={`tip-star${favoriteTips.includes(todayTip.id) ? " on" : ""}`} onClick={() => toggleFavoriteTip(todayTip.id)} aria-pressed={favoriteTips.includes(todayTip.id)} aria-label={favoriteTips.includes(todayTip.id) ? "Retirer des favoris" : "Garder ce conseil en favori"}>{favoriteTips.includes(todayTip.id) ? "★" : "☆"}</button>
            </div>
          </section>
        </div>
      )}

      {activeTab === "Activité" && <ActivityTab data={data} update={update} flash={flash} onOpenSteps={() => setModal("steps")} />}

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
          onCheatDay={openCheatDay}
          onSaveWeight={saveWeight}
          onDeleteWeight={deleteWeight}
          onEditMeal={editMeal}
          onShareMeal={shareMeal}
          onShare={(payload) => openShare(payload)}
          onPlanMeal={(date) => openMealForm(date, true)}
          flash={flash}
        />
      )}

      {activeTab === "Profil" && (
        <div className="content page-content settings">
          {settingsPage === null && (() => {
            const groups: { page?: SettingsPage; action?: () => void; icon: IconName; tone: string; title: string; sub: string }[][] = [
              [
                { page: "objectif", icon: "target", tone: "green", title: "Mon objectif et mes besoins", sub: `${goal.toLocaleString("fr-FR")} kcal, ${result.macros.protein} g de protéines` },
                { page: "hydratation", icon: "water", tone: "cyan", title: "Hydratation", sub: `${formatWater(goalWater)} par jour, ce qui compte` },
                { action: () => setModal("steps"), icon: "shoe", tone: "orange", title: "Mes pas", sub: `Objectif ${data.stepGoal.toLocaleString("fr-FR")} pas` },
              ],
              [{ page: "partager", icon: "share", tone: "green", title: "Faire découvrir Feed Me", sub: "QR code ou envoi de l'application" }],
              [{ page: "tablee", icon: "users", tone: "pink", title: "Ma tablée", sub: (data.tablee ?? []).length ? joinNames(data.tablee ?? []) : "Personne pour l'instant" }],
              [
                { page: "apparence", icon: "palette", tone: "violet", title: "Apparence", sub: `Thème : ${themes.find((item) => item.id === theme)?.name ?? ""}` },
                { page: "rappels", icon: "bell", tone: "orange", title: "Rappels et alarmes", sub: (data.reminders?.alarms ?? []).length ? `${data.reminders!.alarms!.length} alarme${data.reminders!.alarms!.length > 1 ? "s" : ""}, pesée, bilan` : "Créer une alarme, pesée, bilan" },
                { page: "conseils", icon: "bulb", tone: "amber", title: "Conseil du jour", sub: `${favoriteTips.length} en favori${favoriteTips.length > 1 ? "s" : ""}` },
              ],
              [
                { page: "brouillons", icon: "edit", tone: "blue", title: "Repas en cours", sub: "Reprendre un repas commencé" },
                { action: () => setModal("recap"), icon: "file", tone: "orange", title: "Bilan PDF", sub: "Télécharger un récap" },
                { page: "donnees", icon: "shield", tone: "slate", title: "Sauvegarde et données", sub: "Sauvegarde, code et mes données" },
                { action: () => { if (canCheckUpdate()) void searchUpdate(); else flash("Sur le site, tu as déjà la dernière version à chaque ouverture"); }, icon: "redo", tone: "green", title: "Rechercher une mise à jour", sub: updateChecking ? "Recherche en cours…" : `${canCheckUpdate() ? "Version installée" : "Version du site"} : ${__APP_VERSION__.tag || "inconnue"}` },
              ],
            ];
            const query = settingsQuery.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[̀-ͯ]/g, "");
            const visibleGroups = groups.map((group) => group.filter((row) => !query || `${row.title} ${row.sub}`.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[̀-ͯ]/g, "").includes(query))).filter((group) => group.length);
            return (
              <>
                <div className="set-head">
                  <button type="button" className="round-button soft" onClick={() => goTo(tabBeforeProfile)} aria-label="Retour"><Icon name="back" size={20} /></button>
                  <h2 className="set-title">Paramètres</h2>
                </div>
                <label className="set-search"><Icon name="search" size={18} /><input value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="Rechercher un réglage" aria-label="Rechercher un réglage" /></label>
                <button type="button" className="set-me" onClick={() => setSettingsPage("compte")}>
                  <span className="avatar set-avatar">{avatar}</span>
                  <span className="m-t"><b>{profile.firstName} {profile.lastName}</b><small>@{profile.pseudo}</small></span>
                  <Icon name="chevron" size={16} />
                </button>
                {updateTag && (
                  <a className="set-g set-update" href={UPDATE_URL} target="_blank" rel="noreferrer">
                    <span className="set-i tone-green"><Icon name="download" size={20} /></span>
                    <span className="m-t"><b>Mise à jour disponible</b><small>Version {updateTag}, tes données restent</small></span>
                    <Icon name="chevron" size={16} />
                  </a>
                )}
                {visibleGroups.map((group) => (
                  <div className="set-g" key={group[0].title}>
                    {group.map((row) => (
                      <button type="button" className="set-r" key={row.title} onClick={row.action ?? (() => setSettingsPage(row.page!))}>
                        <span className={`set-i tone-${row.tone}`}><Icon name={row.icon} size={20} /></span>
                        <span className="m-t"><b>{row.title}</b><small>{row.sub}</small></span>
                        <Icon name="chevron" size={16} />
                      </button>
                    ))}
                  </div>
                ))}
                {visibleGroups.length === 0 && <p className="theme-description">Aucun réglage à ce nom.</p>}
                <p className="app-version">{versionLabel()}</p>
              </>
            );
          })()}

          {settingsPage !== null && (
            <div className="set-head">
              <button type="button" className="round-button soft" onClick={() => { setSettingsPage(null); window.scrollTo(0, 0); }} aria-label="Retour aux paramètres"><Icon name="back" size={20} /></button>
            </div>
          )}

          {settingsPage === "compte" && (
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
          )}

          {settingsPage === "objectif" && (() => {
            const section = (id: string, title: string, summary: string, content: React.ReactNode) => (
              <section className={objectiveSection === id ? "acc open" : "acc"} key={id}>
                <button type="button" className="acc-h" aria-expanded={objectiveSection === id} onClick={() => setObjectiveSection(objectiveSection === id ? "" : id)}>
                  <span className="m-t"><b>{title}</b><small>{summary}</small></span>
                  <Icon name="chevron" size={16} />
                </button>
                {objectiveSection === id && <div className="acc-b">{content}</div>}
              </section>
            );
            const chosenGoal = goals.find((item) => item.id === planDraft.goal);
            return (
              <form className="objective-page" id="mon-objectif" onSubmit={savePlan} noValidate>
                <h2 className="set-title">Mon objectif</h2>
                <section className="ob-res" aria-live="polite">
                  <div><strong>{previewResult.target.toLocaleString("fr-FR")}</strong><small>kcal par jour</small></div>
                  <div className="sv-mac">
                    <span><b>{previewResult.macros.protein} g</b><small>protéines</small></span>
                    <span><b>{previewResult.macros.carbs} g</b><small>glucides</small></span>
                    <span><b>{previewResult.macros.fat} g</b><small>lipides</small></span>
                  </div>
                </section>
                {section("goal", "Mon objectif", planDraft.goal === "maintien" ? chosenGoal?.label ?? "" : `${chosenGoal?.label} · ${planDraft.targetWeight.replace(".", ",")} kg · ${planDraft.pace.toLocaleString("fr-FR")} kg par semaine`, <PlanEditor value={planDraft} onChange={(draft) => { setPlanDraft(draft); setPlanErrors([]); }} sections={["goal"]} />)}
                {section("method", "Ma méthode", programFor(planDraft.program).label, <PlanEditor value={planDraft} onChange={(draft) => { setPlanDraft(draft); setPlanErrors([]); }} sections={["method"]} />)}
                {section("body", "Mon profil physique", `${planDraft.sex === "femme" ? "Femme" : "Homme"}, ${planDraft.age} ans, ${planDraft.height} cm, ${planDraft.weight.replace(".", ",")} kg`, <PlanEditor value={planDraft} onChange={(draft) => { setPlanDraft(draft); setPlanErrors([]); }} sections={["body"]} />)}
                {section("detail", "Le détail du calcul", `Entretien ${previewResult.maintenance.toLocaleString("fr-FR")} kcal, IMC ${bmi(preview.body.weight, preview.body.height).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`, <PlanResults result={previewResult} body={preview.body} goal={preview.plan.goal} targetWeight={preview.plan.targetWeight} />)}
                {section("measured", "Besoin réel mesuré", observed.ready ? `Environ ${observed.maintenance.toLocaleString("fr-FR")} kcal` : "D'après tes repas et tes pesées", observed.ready ? (
                  <>
                    <p className="theme-description">
                      D'après vos repas et pesées des {observed.days} derniers jours ({observed.loggedDays} jours notés), votre poids évolue de {observed.weeklyChange > 0 ? "+" : "−"}{Math.abs(observed.weeklyChange).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg par semaine : votre besoin d'entretien réel est d'environ <strong>{observed.maintenance.toLocaleString("fr-FR")} kcal</strong>.
                    </p>
                    {plan.customMaintenance
                      ? <button type="button" className="text-button" onClick={() => applyObserved(null)}>Revenir à la formule</button>
                      : <button type="button" className="add-button" onClick={() => applyObserved(observed.maintenance)}><Icon name="check" size={15} /> Utiliser cette valeur</button>}
                  </>
                ) : (
                  <p className="theme-description">{observed.reason} Notez vos repas et pesez-vous chaque semaine : l'app calculera votre besoin réel, plus fiable que n'importe quelle formule.</p>
                ))}
                {planErrors.map((error) => <p key={error} className="form-error" role="alert">{error}</p>)}
                <button className="submit-button" type="submit"><Icon name="check" /> Enregistrer mon objectif</button>
                <p className="health-note">Ces estimations sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.</p>
              </form>
            );
          })()}

          {settingsPage === "partager" && <ShareAppPanel flash={flash} />}

          {settingsPage === "apparence" && (
          <section className="section-block">
            <h2 className="set-title">Apparence</h2>
            <p className="theme-description">Ton choix est conservé sur cet appareil.</p>
            <div className="set-g" role="radiogroup" aria-label="Thème">
              {themes.map((item) => (
                <button type="button" key={item.id} className="set-r" role="radio" aria-checked={theme === item.id} onClick={() => update((current) => ({ ...current, theme: item.id }))}>
                  <span className="m-t"><b>{item.name}</b><small>{item.mode}</small></span>
                  <span className={theme === item.id ? "radio on" : "radio"} />
                </button>
              ))}
            </div>
            <p className="food-section">Affichage des recettes</p>
            <div className="sex-selector recipe-view-switch" role="group" aria-label="Affichage des recettes">
              {(["grid", "list"] as const).map((mode) => (
                <button type="button" key={mode} aria-pressed={(data.recipeView ?? "grid") === mode} className={(data.recipeView ?? "grid") === mode ? "selected" : ""} onClick={() => update((current) => ({ ...current, recipeView: mode }))}><Icon name={mode === "grid" ? "grid" : "rows"} size={17} /> {mode === "grid" ? "Grille" : "Liste"}</button>
              ))}
            </div>
          </section>
          )}

          {settingsPage === "hydratation" && (
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
          )}

          {settingsPage === "rappels" && (
          <section className="section-block">
            <h2 className="set-title">Rappels et alarmes</h2>
            <ReminderSettings value={data.reminders} onChange={(reminders) => update((current) => ({ ...current, reminders }))} flash={flash} />
          </section>
          )}

          {settingsPage === "conseils" && (
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
          )}

          {settingsPage === "brouillons" && (
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
          )}

          {settingsPage === "tablee" && (
          <section className="section-block" id="ma-tablee">
            <div className="section-title"><div><p className="eyebrow">Repas partagés</p><h2>Ma tablée</h2></div></div>
            <p className="theme-description">Les gens avec qui tu manges souvent. Feed Me les propose dans « Mangé avec » et prépare le message pour leur envoyer leur part. Cette liste reste sur ce téléphone.</p>
            {(data.tablee ?? []).length > 0 && (
              <div className="tablee-list">
                {(data.tablee ?? []).map((name) => (
                  <span className="tablee-person" key={name}>
                    <strong>{name}</strong>
                    <button type="button" className="icon-button" onClick={() => tableeApi.removeFromTablee(name)} aria-label={`Retirer ${name} de ma tablée`}><Icon name="close" size={14} /></button>
                  </span>
                ))}
              </div>
            )}
            <form className="shop-add" onSubmit={(event) => { event.preventDefault(); if (!tableeDraft.trim()) return; tableeApi.addToTablee([tableeDraft]); setTableeDraft(""); }}>
              <input value={tableeDraft} onChange={(event) => setTableeDraft(event.target.value)} placeholder="Prénom (Alex, Sam…)" aria-label="Prénom à ajouter à ma tablée" maxLength={40} />
              <button type="submit" className="add-button" aria-label="Ajouter à ma tablée"><Icon name="plus" size={16} /></button>
            </form>
          </section>
          )}

          {settingsPage === "donnees" && (
          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Confidentialité</p><h2>Mes données</h2></div></div>
            <p className="theme-description">Tout est enregistré uniquement sur cet appareil. Désinstaller l'application efface les données : exportez une sauvegarde régulièrement.</p>
            <div className="settings-list">
              <button onClick={runExport}><Icon name="download" /><span><strong>Exporter une sauvegarde</strong><small>Fichier à garder ou à partager</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={() => backupInput.current?.click()}><Icon name="upload" /><span><strong>Importer une sauvegarde</strong><small>Remplace les données actuelles</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={() => setModal("pin")}><Icon name="edit" /><span><strong>Changer mon code</strong><small>Nouveau code à 4 chiffres</small></span><Icon name="chevron" size={17} /></button>
              <button onClick={onLock}><Icon name="lock" /><span><strong>Verrouiller maintenant</strong><small>Le code sera demandé</small></span><Icon name="chevron" size={17} /></button>
              <button className="danger" onClick={() => setErasing(true)}><Icon name="trash" /><span><strong>Effacer toutes les données</strong><small>Gardées 30 jours dans la corbeille</small></span><Icon name="chevron" size={17} /></button>
            </div>
            <input ref={backupInput} className="hidden-input" type="file" accept="application/json,.json" onChange={importBackup} />
            {erasing && <EraseConfirm pin={data.pin} onErase={onReset} onCancel={() => setErasing(false)} />}
          </section>
          )}
        </div>
      )}

      {activeTab === "Recettes" && <RecipesTab onShare={(payload) => openShare(payload)} recipes={data.recipes} recipeView={data.recipeView ?? "grid"} meals={data.meals} prefill={prefillRecipe} onPrefillUsed={() => setPrefillRecipe(null)} update={update} onAddToJournal={addRecipeToJournal} flash={flash} onReceive={openShareImport} focusRecipeId={focusRecipeId} />}

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
            onClick={() => (item.label === "Ajouter" ? setModal("add") : goTo(item.label))}
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
                <h2>{editingMeal ? "Modifier le repas" : cheatStart ? "Noter un cheat day" : "Ajouter un repas"}</h2>
                <MealComposer
                  key={`${editingMeal?.id ?? "nouveau"}-${composerKey}`}
                  cheatDay={cheatStart && !editingMeal}
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
                  category={composerCategory ?? defaultCategory()}
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
                <h2>Noter</h2>
                <div className="add-tiles">
                  <button className="add-tile hero" onClick={() => openMealForm()}><Icon name="apple" size={30} /><b>Un repas</b></button>
                  <button className="add-tile tone-water" onClick={() => { goTo("Accueil", "eau"); }}><Icon name="water" size={24} /><b>De l'eau</b></button>
                  <button className="add-tile tone-rose" onClick={() => setModal("weigh")}><Icon name="scale" size={24} /><b>Une pesée</b></button>
                  <button className="add-tile tone-orange" onClick={() => goTo("Activité")}><Icon name="flame" size={24} /><b>Une séance</b></button>
                  <button className="add-tile tone-lime" onClick={() => setModal("steps")}><Icon name="shoe" size={24} /><b>Mes pas</b></button>
                  <button className="add-tile tone-amber" onClick={() => openCheatDay()}><Icon name="confetti" size={24} /><b>Un cheat day</b></button>
                  <button className="add-tile tone-orange" onClick={() => setModal("pantry")}><Icon name="carrot" size={24} /><b>Mes ingrédients</b></button>
                  <button className="add-tile tone-blue" onClick={() => { setModal(null); photoInput.current?.click(); }}><Icon name="camera" size={24} /><b>Photo du repas</b></button>
                  <button className="add-tile tone-water" onClick={openShareImport}><Icon name="link" size={24} /><b>Un partage reçu</b></button>
                  <button className="add-tile tone-green" onClick={() => goTo("Suivi", "semaine")}><Icon name="cart" size={24} /><b>Mes courses</b></button>
                </div>
              </>
            )}
            {modal === "pantry" && (
              <>
                <p className="eyebrow">Ma liste de produits</p>
                <h2>Mes ingrédients</h2>
                <PantryPanel flash={flash} />
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
                <h2>{outgoingShare.kind === "retour" ? `Prévenir ${outgoingGuests[0] ?? "la personne qui a cuisiné"} ?` : outgoingShare.kind === "repas" ? (outgoingShare.meal.plate && outgoingGuests.length ? `Envoyer ${outgoingGuests.length > 1 ? "leur" : "sa"} part` : "Envoyer ce repas") : "Partager"}</h2>
                {outgoingShare.kind === "retour" && <p className="theme-description">Repas enregistré. C'est facultatif : {outgoingGuests[0] ?? "la personne"} verra sur son repas que tu as pris {outgoingShare.retour.part}.</p>}
                {outgoingShare.kind === "repas" && <p className="theme-description">{outgoingGuests.length > 1 ? `Repas enregistré. ${joinNames(outgoingGuests)} le verront en aperçu, puis choisiront le jour, le moment et leurs propres quantités avant de l'ajouter.` : `${outgoingGuests.length ? `Repas enregistré. ${outgoingGuests[0]}` : "La personne"} le verra en aperçu, puis choisira le jour, le moment et ses propres quantités avant de l'ajouter.`}</p>}
                <ShareSheet payload={outgoingShare} guests={outgoingGuests} id={outgoingId} onClose={() => setModal(null)} />
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
                  onAddedProducts={(count) => { setModal(null); flash(`${count} ingrédient${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""} à Mes ingrédients`); }}
                  onAddPlanned={addSharedPlanned}
                  onAddShopping={addSharedShopping}
                  onAddRecipes={addSharedRecipes}
                  onAck={addAck}
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
    </TableeContext.Provider>
    </CorrectionsContext.Provider>
  );
}

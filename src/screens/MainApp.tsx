import { useEffect, useRef, useState } from "react";
import ActivityTab from "../components/ActivityTab";
import ChangePin from "../components/ChangePin";
import FastingCard from "../components/FastingCard";
import MealComposer, { type MealExtras } from "../components/MealComposer";
import GoalCard from "../components/GoalCard";
import Icon, { type IconName } from "../components/Icon";
import PlanEditor from "../components/PlanEditor";
import PlanResults from "../components/PlanResults";
import RecipesTab from "../components/RecipesTab";
import StepsPanel from "../components/StepsPanel";
import TrackingTab from "../components/TrackingTab";
import { exportBackup } from "../lib/backup";
import { programFor, tipOfTheDay } from "../lib/goals";
import { restoreImages } from "../lib/images";
import { readPhoneSteps, readSteps } from "../lib/steps";
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
  type SourceType,
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
type ModalType = "meal" | "add" | "pin" | "steps" | null;

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
  const [activeTab, setActiveTab] = useState<Tab>("Accueil");
  const [modal, setModal] = useState<ModalType>(null);
  /** Photo à analyser dans la fenêtre d'ajout de repas. */
  const [mealPhoto, setMealPhoto] = useState<File | null>(null);
  // La photo ne sert qu'à l'ouverture de cette fenêtre-là.
  useEffect(() => { if (modal !== "meal") setMealPhoto(null); }, [modal]);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [notice, setNotice] = useState("");
  const [planDraft, setPlanDraft] = useState(() => draftFrom(profile, data.plan));
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  /** Jour auquel le formulaire de repas ajoute l'entrée (aujourd'hui, ou un jour choisi dans le suivi). */
  const [mealDate, setMealDate] = useState(today);
  const photoInput = useRef<HTMLInputElement>(null);
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
  const todayMeals = data.meals.filter((meal) => meal.date === today);
  const consumed = todayMeals.reduce((sum, meal) => sum + meal.calories, 0);
  const proteinToday = todayMeals.reduce((sum, meal) => sum + (meal.protein ?? 0), 0);
  const observed = observedMaintenance(data.meals, data.weights, today);

  // Aperçu en direct pendant la saisie ; la valeur enregistrée sinon.
  const draftValid = !bodyErrors(planDraft).length && !goalErrors(planDraft).length;
  const preview = draftValid ? parseDraft(planDraft) : { body: profile, plan };
  const previewResult = draftValid ? computePlan(preview.body, { ...preview.plan, customMaintenance: plan.customMaintenance }) : result;
  const remaining = goal - consumed;
  const progress = Math.round((consumed / goal) * 100);
  const water = data.water[today] ?? 0;
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

  const addMealEntry = (name: string, calories: number, source: SourceType, category = defaultCategory(), protein?: number, date = today) => {
    const meal: Meal = { id: Date.now(), date, category, name, calories, source, ...(protein ? { protein } : {}) };
    update((current) => ({ ...current, meals: [...current.meals, meal] }));
  };

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
      return { ...current, meals: [...current.meals, { ...meal, id: Date.now() }], leftovers };
    });
    setModal(null);
    flash(extras.leftover ? `Ma part : ${meal.calories} kcal · reste gardé` : `Repas enregistré · ${meal.calories} kcal`);
  };

  const discardLeftover = (id: number) => {
    if (window.confirm("Jeter ce reste ? Il ne sera plus proposé.")) {
      update((current) => ({ ...current, leftovers: current.leftovers.filter((item) => item.id !== id) }));
    }
  };

  const openMealForm = (date = today) => {
    setMealDate(date);
    setModal("meal");
  };

  /** Dernière quantité ajoutée : le bouton « moins » l'annule. */
  const [lastWater, setLastWater] = useState(200);
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

  const addRecipeToJournal = (recipe: Recipe) => {
    addMealEntry(recipe.name, recipe.calories, "recipe", defaultCategory(), recipe.protein);
    flash(`${recipe.name} ajouté au journal`);
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

  const goTo = (tab: Tab, section?: string) => {
    setModal(null);
    setActiveTab(tab);
    window.setTimeout(() => (section ? document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }) : window.scrollTo(0, 0)), 50);
  };
  const goToProfile = (section: "mon-objectif") => goTo("Profil", section);
  const goToWeight = () => goTo("Suivi", "suivi-poids");

  const avatar = (
    <>{profile.photo ? <img src={profile.photo} alt="" /> : <span>{initials(profile)}</span>}</>
  );

  return (
    <>
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
              <div className="calorie-meta">
                <span><strong>{consumed.toLocaleString("fr-FR")}</strong> consommées</span>
                <span><strong>{goal.toLocaleString("fr-FR")}</strong> objectif</span>
                {showProtein && <span><strong>{proteinToday}/{result.macros.protein} g</strong> protéines</span>}
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
            <div><p className="eyebrow">Conseil du jour · {program.short}</p><p>{tipOfTheDay(plan.goal, plan.program)}</p></div>
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
                <strong>{formatWater(water)} <span>sur {formatWater(goalWater)}</span></strong>
              </div>
              <button className="round-button soft" onClick={() => addWater(-lastWater)} disabled={water === 0} aria-label={`Retirer ${lastWater} ml`}>
                <Icon name="minus" size={18} />
              </button>
            </div>
            <div className="water-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (water / goalWater) * 100)}%` }} /></div>
            <div className="water-amounts">
              {waterAmounts.map((amount) => (
                <button key={amount.ml} onClick={() => addWater(amount.ml)} aria-label={`Ajouter ${amount.ml} ml d'eau`}>
                  <strong>+{amount.ml} ml</strong>
                  <small>{amount.label}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="section-block meals">
            <div className="section-title">
              <div>
                <p className="eyebrow">Journal</p>
                <h2>Repas du jour</h2>
              </div>
              <button className="add-button" onClick={() => openMealForm()}><Icon name="plus" size={17} /> Ajouter</button>
            </div>
            <button className="photo-meal-card" onClick={() => photoInput.current?.click()}>
              <span className="camera-icon"><Icon name="camera" /></span>
              <span>
                <strong>Photographier mon repas</strong>
                <small>Reconnaissance du plat sur le téléphone, à vérifier</small>
              </span>
              <Icon name="chevron" size={18} />
            </button>
            <input ref={photoInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={takeMealPhoto} />
            <div className="meal-list">
              {todayMeals.length === 0 && (
                <button className="meal-row empty" onClick={() => openMealForm()}>
                  <span className="meal-icon dinner"><Icon name="plus" /></span>
                  <span><strong>Aucun repas pour l'instant</strong><small>Ajoutez votre premier repas de la journée</small></span>
                  <Icon name="chevron" size={17} />
                </button>
              )}
              {todayMeals.map((meal) => (
                <div className="meal-row" key={meal.id}>
                  <span className={`meal-icon ${categoryStyle[meal.category]}`}><Icon name={meal.source === "photo" ? "camera" : meal.source === "recipe" ? "book" : "apple"} /></span>
                  <span><strong>{mealCategories.find((item) => item.id === meal.category)?.label}</strong><small>{meal.name}</small></span>
                  <span className="meal-calories"><strong>{meal.calories}</strong><small>kcal</small></span>
                  <button className="icon-button" onClick={() => deleteMeal(meal)} aria-label={`Supprimer ${meal.name}`}><Icon name="trash" size={16} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === "Activité" && <ActivityTab data={data} update={update} flash={flash} />}

      {activeTab === "Suivi" && (
        <TrackingTab
          data={data}
          update={update}
          target={goal}
          goal={plan.goal}
          waterGoal={goalWater}
          onAddMeal={openMealForm}
          onSaveWeight={saveWeight}
          onDeleteWeight={deleteWeight}
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

      {activeTab === "Recettes" && <RecipesTab recipes={data.recipes} update={update} onAddToJournal={addRecipeToJournal} flash={flash} />}

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
            {modal === "meal" && (
              <>
                <p className="eyebrow">Journal alimentaire</p>
                <h2>Ajouter un repas</h2>
                <MealComposer
                  initialPhoto={mealPhoto ?? undefined}
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
                  <button onClick={goToWeight}><span className="meal-icon dinner"><Icon name="scale" /></span><span><strong>Une pesée</strong><small>Suivre l'évolution de mon poids</small></span><Icon name="chevron" /></button>
                  <button onClick={() => goTo("Activité")}><span className="meal-icon mint-icon"><Icon name="shoe" /></span><span><strong>Une séance de sport</strong><small>Marche, course, musculation, yoga…</small></span><Icon name="chevron" /></button>
                </div>
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
    </>
  );
}

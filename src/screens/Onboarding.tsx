import { useRef, useState } from "react";
import Icon from "../components/Icon";
import PinPad from "../components/PinPad";
import PlanEditor from "../components/PlanEditor";
import PlanResults from "../components/PlanResults";
import { restoreImages } from "../lib/images";
import { computePlan } from "../lib/nutrition";
import { bodyErrors, draftFrom, goalErrors, parseDraft, withSuggestedTarget } from "../lib/planDraft";
import {
  createPin,
  defaultData,
  initials,
  parseBackup,
  resizePhoto,
  todayKey,
  type AppData,
} from "../lib/storage";

type OnboardingProps = {
  onCreate: (data: AppData) => void;
  onImport: (data: AppData) => void;
};

type Step = "welcome" | "identity" | "body" | "goal" | "pin" | "confirm";
const steps: Step[] = ["identity", "body", "goal", "pin", "confirm"];

export default function Onboarding({ onCreate, onImport }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [identity, setIdentity] = useState({ firstName: "", lastName: "", pseudo: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState(() =>
    draftFrom({ sex: "femme", age: 0, height: 0, weight: 0, activity: "1.4" }, { goal: "perte", program: "equilibre", targetWeight: null, pace: 0.5 }),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const { body, plan } = parseDraft(draft);
  const goalValid = !bodyErrors(draft).length && !goalErrors(draft).length;
  const stepIndex = steps.indexOf(step);
  const changeDraft = (next: typeof draft) => { setDraft(next); setErrors([]); };

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPhoto(await resizePhoto(file));
    } catch {
      setErrors(["Cette image n'a pas pu être lue. Essayez une autre photo."]);
    }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const backup = parseBackup(await file.text());
    if (!backup) {
      setErrors(["Ce fichier n'est pas une sauvegarde Feed Me valide."]);
      return;
    }
    await restoreImages(backup.images).catch(() => undefined);
    onImport(backup.data);
  };

  const submitIdentity = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors([]);
    setStep("body");
  };

  const submitBody = (event: React.FormEvent) => {
    event.preventDefault();
    const found = bodyErrors(draft);
    setErrors(found);
    if (found.length) return;
    setDraft(withSuggestedTarget(draft));
    setStep("goal");
  };

  const submitGoal = (event: React.FormEvent) => {
    event.preventDefault();
    const found = goalErrors(draft);
    setErrors(found);
    if (!found.length) setStep("pin");
  };

  const confirmPin = async (pin: string) => {
    if (pin !== firstPin) {
      setPinError("Les deux codes ne correspondent pas. Recommencez.");
      setFirstPin("");
      setStep("pin");
      return;
    }
    const profile = {
      firstName: identity.firstName.trim(),
      lastName: identity.lastName.trim(),
      pseudo: identity.pseudo.trim(),
      photo,
      ...body,
      createdAt: new Date().toISOString(),
    };
    const fullPlan = { ...plan, startWeight: body.weight, startDate: todayKey(), customMaintenance: null };
    onCreate(defaultData(profile, await createPin(pin), "sauge", fullPlan));
  };

  return (
    <div className="auth-screen onboarding">
      {step !== "welcome" && (
        <div className="onboarding-progress" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-label={`Étape ${stepIndex + 1} sur ${steps.length}`}>
          {steps.map((item, index) => <span key={item} className={index <= stepIndex ? "done" : ""} />)}
        </div>
      )}

      {step === "welcome" && (
        <section className="welcome">
          <span className="welcome-logo"><Icon name="apple" size={34} /></span>
          <p className="eyebrow">Bienvenue</p>
          <h1>Feed Me</h1>
          <p className="welcome-text">
            Votre compagnon pour suivre repas, hydratation, activité et poids, à votre rythme.
          </p>
          <ul className="welcome-points">
            <li><Icon name="lock" size={17} /> Protégé par un code à 4 chiffres</li>
            <li><Icon name="check" size={17} /> Données gardées uniquement sur cet appareil</li>
            <li><Icon name="target" size={17} /> Estimations indicatives, sans jugement</li>
          </ul>
          {errors.length > 0 && <p className="form-error" role="alert">{errors[0]}</p>}
          <div className="welcome-choices">
            <button className="welcome-choice primary" onClick={() => setStep("identity")}>
              <Icon name="user" size={22} />
              <span><strong>Nouveau compte</strong><small>Je commence avec Feed Me</small></span>
            </button>
            <button className="welcome-choice" onClick={() => backupInput.current?.click()}>
              <Icon name="upload" size={22} />
              <span><strong>Importer une sauvegarde</strong><small>J'avais déjà Feed Me (fichier exporté)</small></span>
            </button>
          </div>
          <input ref={backupInput} className="hidden-input" type="file" accept="application/json,.json" onChange={importBackup} />
        </section>
      )}

      {step === "identity" && (
        <form className="onboarding-form" onSubmit={submitIdentity}>
          <p className="eyebrow">Étape 1</p>
          <h2>Faisons connaissance</h2>
          <button type="button" className="photo-picker" onClick={() => photoInput.current?.click()}>
            <span className="photo-picker-avatar">
              {photo ? <img src={photo} alt="Votre photo de profil" /> : initials(identity) || <Icon name="user" size={30} />}
            </span>
            <span className="photo-picker-badge"><Icon name="camera" size={15} /></span>
            <small>{photo ? "Changer la photo" : "Ajouter une photo (facultatif)"}</small>
          </button>
          <input ref={photoInput} className="hidden-input" type="file" accept="image/*" onChange={choosePhoto} />
          <label>Prénom<input value={identity.firstName} onChange={(e) => setIdentity({ ...identity, firstName: e.target.value })} autoComplete="given-name" required /></label>
          <label>Nom<input value={identity.lastName} onChange={(e) => setIdentity({ ...identity, lastName: e.target.value })} autoComplete="family-name" required /></label>
          <label>Pseudo<input value={identity.pseudo} onChange={(e) => setIdentity({ ...identity, pseudo: e.target.value })} placeholder="Affiché dans l'application" maxLength={24} required /></label>
          {errors.length > 0 && <p className="form-error" role="alert">{errors[0]}</p>}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setStep("welcome")}>Retour</button>
            <button className="submit-button" type="submit">Continuer</button>
          </div>
        </form>
      )}

      {step === "body" && (
        <form className="onboarding-form" onSubmit={submitBody} noValidate>
          <p className="eyebrow">Étape 2</p>
          <h2>Votre profil physique</h2>
          <p className="form-hint">Ces informations servent uniquement à estimer votre besoin calorique.</p>
          <PlanEditor value={draft} onChange={changeDraft} sections={["body"]} />
          {errors.map((error) => <p key={error} className="form-error" role="alert">{error}</p>)}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => { setErrors([]); setStep("identity"); }}>Retour</button>
            <button className="submit-button" type="submit">Continuer</button>
          </div>
        </form>
      )}

      {step === "goal" && (
        <form className="onboarding-form" onSubmit={submitGoal} noValidate>
          <p className="eyebrow">Étape 3</p>
          <h2>Votre objectif</h2>
          <p className="form-hint">L'accueil, les conseils et le suivi s'adaptent à votre choix. Vous pourrez le modifier à tout moment dans le profil.</p>
          <PlanEditor value={draft} onChange={changeDraft} sections={["goal"]} />
          {goalValid && <PlanResults result={computePlan(body, { ...plan, customMaintenance: null })} body={body} goal={plan.goal} targetWeight={plan.targetWeight} compact />}
          {errors.map((error) => <p key={error} className="form-error" role="alert">{error}</p>)}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => { setErrors([]); setStep("body"); }}>Retour</button>
            <button className="submit-button" type="submit">Continuer</button>
          </div>
        </form>
      )}

      {step === "pin" && (
        <PinPad
          title="Créez votre code"
          subtitle="4 chiffres, demandés à chaque ouverture de l'application"
          error={pinError}
          onComplete={(pin) => { setFirstPin(pin); setPinError(""); setStep("confirm"); }}
        />
      )}

      {step === "confirm" && (
        <PinPad title="Confirmez votre code" subtitle="Saisissez à nouveau les 4 chiffres" onComplete={confirmPin} />
      )}

      {(step === "pin" || step === "confirm") && (
        <button type="button" className="text-button forgot-button" onClick={() => { setPinError(""); setStep("goal"); }}>Retour</button>
      )}
    </div>
  );
}

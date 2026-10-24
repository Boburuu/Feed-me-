import { useEffect, useState } from "react";
import { versionLabel } from "../lib/version";
import PinPad from "../components/PinPad";
import { checkPin, initials, pinLength, type AppData } from "../lib/storage";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

type LockScreenProps = {
  data: AppData;
  onUnlock: () => void;
  onReset: () => void;
};

export default function LockScreen({ data, onUnlock, onReset }: LockScreenProps) {
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const { profile } = data;

  useEffect(() => {
    if (!waitUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const submit = async (pin: string) => {
    if (await checkPin(pin, data.pin)) {
      onUnlock();
      return;
    }
    const count = attempts + 1;
    if (count >= MAX_ATTEMPTS) {
      setAttempts(0);
      setWaitUntil(Date.now() + LOCKOUT_SECONDS * 1000);
      setNow(Date.now());
      setError(`Trop d'essais. Patientez ${LOCKOUT_SECONDS} secondes.`);
    } else {
      setAttempts(count);
      setError(`Code incorrect. Encore ${MAX_ATTEMPTS - count} essai${MAX_ATTEMPTS - count > 1 ? "s" : ""}.`);
    }
  };

  const forgot = () => {
    const confirmed = window.confirm(
      "Sans serveur, le code ne peut pas être récupéré.\n\nRéinitialiser efface toutes les données de Feed Me sur cet appareil (profil, repas, poids, recettes). Vous pourrez ensuite importer une sauvegarde.\n\nContinuer ?",
    );
    if (confirmed) onReset();
  };

  return (
    <div className="auth-screen">
      <div className="lock-identity">
        <span className="lock-avatar">
          {profile.photo ? <img src={profile.photo} alt="" /> : initials(profile)}
        </span>
        <p className="eyebrow">Feed Me</p>
      </div>
      <PinPad
        title={`Bonjour, ${profile.pseudo || profile.firstName}`}
        subtitle={remaining ? `Nouvel essai possible dans ${remaining} s` : `Saisissez votre code à ${pinLength(data.pin)} chiffres`}
        error={error}
        disabled={remaining > 0}
        length={pinLength(data.pin)}
        onComplete={submit}
      />
      <button type="button" className="text-button forgot-button" onClick={forgot}>Code oublié ?</button>
      <small className="lock-version">{versionLabel()}</small>
    </div>
  );
}

import { useState } from "react";
import PinPad from "./PinPad";
import { checkPin, createPin, pinLength, PIN_LENGTH, type PinRecord } from "../lib/storage";

type ChangePinProps = {
  current: PinRecord;
  onSave: (pin: PinRecord) => void;
};

/** Code actuel, puis nouveau code à 4 chiffres saisi deux fois. */
export default function ChangePin({ current, onSave }: ChangePinProps) {
  const [step, setStep] = useState<"current" | "new" | "confirm">("current");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");

  const checkCurrent = async (pin: string) => {
    if (await checkPin(pin, current)) {
      setError("");
      setStep("new");
    } else {
      setError("Code incorrect.");
    }
  };

  const confirm = async (pin: string) => {
    if (pin !== first) {
      setError("Les deux codes ne correspondent pas. Recommencez.");
      setFirst("");
      setStep("new");
      return;
    }
    onSave(await createPin(pin));
  };

  return (
    <div className="change-pin">
      {step === "current" && (
        <PinPad key="current" title="Code actuel" subtitle={`Saisissez votre code à ${pinLength(current)} chiffres`} length={pinLength(current)} error={error} onComplete={checkCurrent} />
      )}
      {step === "new" && (
        <PinPad key="new" title="Nouveau code" subtitle={`${PIN_LENGTH} chiffres`} error={error} onComplete={(pin) => { setFirst(pin); setError(""); setStep("confirm"); }} />
      )}
      {step === "confirm" && (
        <PinPad key="confirm" title="Confirmez le code" subtitle={`Saisissez à nouveau les ${PIN_LENGTH} chiffres`} onComplete={confirm} />
      )}
    </div>
  );
}

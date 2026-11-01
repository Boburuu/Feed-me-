import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Icon from "./Icon";
import { LINK_COMFORT_LENGTH, shareFileName, shareLink, shareName, withMeta, type SharePayload } from "../lib/share";
import { cleanName, joinNames, newShareId, sameName } from "../lib/tablee";
import { useTablee } from "../lib/tableeContext";

type ShareSheetProps = {
  payload: SharePayload;
  onClose: () => void;
  /** Personnes déjà choisies (« Mangé avec » du repas) : le message leur est adressé. */
  guests?: string[];
  /** Identifiant du lien, gardé sur le repas pour y rattacher les retours. */
  id?: string;
};

/** Envoie le message par la feuille de partage du téléphone, ou le copie. */
async function sendText(title: string, text: string) {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text });
    return "sent";
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return "sent";
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

async function sendFile(payload: SharePayload) {
  const fileName = shareFileName(payload);
  const content = JSON.stringify(payload, null, 1);
  if (Capacitor.isNativePlatform()) {
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const file = await Filesystem.writeFile({ path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: fileName, files: [file.uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** « la recette », « l'assiette », « les repas prévus »… */
function whatOf(payload: SharePayload) {
  switch (payload.kind) {
    case "recette": return "la recette";
    case "ingredients": return payload.products.length > 1 ? "les ingrédients" : "l'ingrédient";
    case "repas": return payload.meal.plate ? "l'assiette" : "le repas";
    case "semaine": return "les repas prévus";
    case "courses": return "la liste de courses";
    case "carnet": return "tout mon carnet";
    case "retour": return "ma part";
  }
}

/** Le message prêt à envoyer : à qui, ce que c'est, et quoi faire du lien. */
export function shareMessage(payload: SharePayload, to: string[], from: string, link: string) {
  const name = shareName(payload);
  const hello = to.length ? `${joinNames(to)} : ` : "";
  const many = to.length > 1;
  let body: string;
  switch (payload.kind) {
    case "repas":
      body = payload.meal.plate
        ? `🍽️ ${name} · ${many ? "vos parts vous attendent" : "ta part t'attend"} ! ${from ? `${from} a` : "J'ai"} cuisiné pour ${payload.meal.plate.servings}. Touche le lien pour ${many ? "ajouter chacun votre part" : "ajouter ta part"} dans Feed Me :`
        : `🍽️ ${name} : le repas avec ses quantités. Touche le lien pour l'ajouter dans Feed Me :`;
      break;
    case "recette": body = `📖 Recette « ${name} » : ingrédients, étapes et valeurs. Touche le lien pour l'ajouter à ton carnet Feed Me :`; break;
    case "ingredients": body = `🧺 ${name} : touche le lien pour l'ajouter dans « Mes ingrédients » sur Feed Me :`; break;
    case "semaine": body = `📅 ${name}${from ? ` par ${from}` : ""} : touche le lien pour les ajouter à ton planning Feed Me (rien ne compte avant « Mangé ») :`; break;
    case "courses": body = `🛒 ${name} : touche le lien pour l'ajouter à ta liste dans Feed Me :`; break;
    case "carnet": body = `📚 ${name} : touche le lien et choisis ce que tu gardes dans Feed Me :`; break;
    case "retour": body = `✓ ${from ? `${from} a` : "J'ai"} pris ${payload.retour.part} de « ${payload.retour.name} ». Touche le lien pour le noter sur ton repas dans Feed Me :`; break;
  }
  return `${hello}${body}\n${link}\n(Pas encore Feed Me ? Le lien s'ouvre aussi dans le navigateur.)`;
}

/**
 * Partager n'importe quoi (recette, assiette, repas, ingrédients, repas prévus, courses,
 * carnet) : un lien qui contient tout, sans compte ni serveur, envoyé dans l'appli de
 * messages habituelle. On choisit à qui dans sa tablée : un message de groupe, ou un par
 * personne. Chez la personne qui le reçoit, rien n'est ajouté sans son accord.
 */
export default function ShareSheet({ payload, onClose, guests, id: givenId }: ShareSheetProps) {
  const tablee = useTablee();
  const myName = tablee?.myName ?? "";
  const people = tablee?.tablee ?? [];
  const [id] = useState(() => givenId ?? newShareId());
  const [selected, setSelected] = useState<string[]>(() => guests ?? []);
  const [sent, setSent] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const name = shareName(payload);
  const what = whatOf(payload);
  // Prénoms proposés : la tablée, plus les invités du repas qui n'y sont pas encore.
  const choices = useMemo(() => [...people, ...(guests ?? []).filter((guest) => !people.some((entry) => sameName(entry, guest)))], [people, guests]);
  const sending = useMemo(() => withMeta(payload, { from: myName, guests: selected, id }), [payload, myName, selected, id]);

  useEffect(() => {
    let alive = true;
    setLink(null);
    shareLink(sending).then((value) => { if (alive) setLink(value); }).catch(() => { if (alive) setNote("Lien impossible sur cet appareil : envoie le fichier."); });
    return () => { alive = false; };
  }, [sending]);

  const toggle = (person: string) => setSelected((current) => (current.some((entry) => sameName(entry, person)) ? current.filter((entry) => !sameName(entry, person)) : [...current, person]));
  const everyone = choices.length > 1 && choices.every((person) => selected.some((entry) => sameName(entry, person)));
  const isSent = (person: string) => sent.some((entry) => sameName(entry, person));
  const addPerson = () => {
    const person = cleanName(adding);
    if (!person) return;
    tablee?.addToTablee([person]);
    if (!selected.some((entry) => sameName(entry, person))) setSelected((current) => [...current, person]);
    setAdding("");
  };

  const long = !!link && link.length > LINK_COMFORT_LENGTH;
  const run = (action: () => Promise<unknown>, done: string, then?: () => void) => action().then(() => { if (done) setNote(done); then?.(); }).catch((error: unknown) => {
    // Feuille de partage fermée sans choisir : ce n'est pas une erreur.
    if (error instanceof Error && /cancel|abort/i.test(`${error.name} ${error.message}`)) return;
    setNote("Le partage n'a pas abouti.");
  });
  const send = (to: string[]) => void run(
    () => sendText(name, shareMessage(payload, to, myName, link!)).then((how) => { if (how === "copied") setNote("Message copié : colle-le dans la conversation."); }),
    "",
    () => setSent((current) => [...current, ...to]),
  );

  return (
    <section className="barcode-panel share-sheet">
      <div className="barcode-head">
        <strong>Partager {what}</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={15} /></button>
      </div>
      <p className="food-hint">« {name} » : tout est dans le lien, sans les photos et sans passer par un serveur. Tu l'envoies dans ta conversation habituelle ; la personne voit un aperçu et choisit ce qu'elle ajoute.</p>

      <div className="share-who">
        <span className="share-who-title">À qui ?</span>
        {choices.length > 0 && (
          <div className="container-chips" role="group" aria-label="Destinataires">
            {choices.length > 1 && <button type="button" aria-pressed={everyone} className={everyone ? "selected" : ""} onClick={() => setSelected(everyone ? [] : [...choices])}>Toute ma tablée</button>}
            {choices.map((person) => {
              const on = selected.some((entry) => sameName(entry, person));
              return <button type="button" key={person} aria-pressed={on} className={on ? "selected" : ""} onClick={() => toggle(person)}>{person}</button>;
            })}
          </div>
        )}
        <form className="share-who-add" onSubmit={(event) => { event.preventDefault(); addPerson(); }}>
          <input value={adding} onChange={(event) => setAdding(event.target.value)} placeholder={choices.length ? "Quelqu'un d'autre (prénom)" : "Prénom (facultatif)"} aria-label="Ajouter un prénom" maxLength={40} />
          <button type="submit" className="text-button" disabled={!adding.trim()}><Icon name="plus" size={14} /> Ajouter</button>
        </form>
        {!choices.length && <small className="barcode-hint">Les prénoms ajoutés vont dans « Ma tablée » (Profil) : ils seront proposés la prochaine fois.</small>}
      </div>

      {!link && !note && <p className="food-hint"><span className="loader" /> Préparation du lien…</p>}
      {link && (
        <div className="barcode-choices">
          {selected.length > 1 ? (
            <>
              <button type="button" className="add-part" onClick={() => send(selected)}>
                <Icon name="share" size={16} /> {selected.every(isSent) ? "Renvoyer" : "Envoyer"} à tous en un message (groupe)
              </button>
              <small className="barcode-hint">Pas de conversation de groupe ? Un message par personne :</small>
              <div className="share-people">
                {selected.map((person) => (
                  <div className="share-person" key={person}>
                    <strong>{person}</strong>
                    {isSent(person) ? <em><Icon name="check" size={14} /> Envoyé</em> : <button type="button" className="add-part" onClick={() => send([person])}><Icon name="share" size={14} /> Envoyer</button>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="add-part" onClick={() => send(selected)}>
              <Icon name="share" size={16} /> {selected.length ? `Envoyer à ${selected[0]}` : "Envoyer le lien"}{selected.length && isSent(selected[0]) ? " ✓" : ""}
            </button>
          )}
          <button type="button" className="add-part" onClick={() => void run(() => navigator.clipboard.writeText(link), "Lien copié : colle-le dans un message.")}>
            <Icon name="link" size={16} /> Copier le lien
          </button>
          <button type="button" className="add-part" onClick={() => void run(() => sendFile(sending), Capacitor.isNativePlatform() ? "Fichier envoyé." : "Fichier enregistré dans tes téléchargements.")}>
            <Icon name="download" size={16} /> Envoyer le fichier
          </button>
        </div>
      )}
      {long && <small className="barcode-hint">Lien long ({link!.length} caractères) : certaines applis de messages risquent de le couper. Si la personne n'arrive pas à l'ouvrir, envoie plutôt le fichier.</small>}
      {note && <p className="food-hint" role="status">{note}</p>}
    </section>
  );
}

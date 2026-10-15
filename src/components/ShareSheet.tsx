import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Icon from "./Icon";
import { LINK_COMFORT_LENGTH, shareFileName, shareLink, type SharePayload } from "../lib/share";

type ShareSheetProps = {
  payload: SharePayload;
  onClose: () => void;
};

/** Envoie le partage par la feuille de partage du téléphone, ou le copie. */
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

/**
 * Partager une recette, une assiette ou un repas : un lien qui contient tout (aucun compte,
 * aucun serveur), ou un fichier JSON pour les gros partages. Chez la personne qui le
 * reçoit, rien n'est ajouté sans son accord.
 */
export default function ShareSheet({ payload, onClose }: ShareSheetProps) {
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const name = payload.kind === "recette" ? payload.recipe.name : payload.meal.name;
  const what = payload.kind === "recette" ? "la recette" : payload.meal.plate ? "l'assiette" : "le repas";

  useEffect(() => {
    let alive = true;
    shareLink(payload).then((value) => { if (alive) setLink(value); }).catch(() => { if (alive) setNote("Lien impossible sur cet appareil : envoie le fichier."); });
    return () => { alive = false; };
  }, [payload]);

  const long = !!link && link.length > LINK_COMFORT_LENGTH;
  const message = link ? `${name} — ${what} partagée depuis Feed Me. Touche le lien pour l'ouvrir, ou colle-le dans Feed Me (bouton « + » › Un partage reçu) :\n${link}` : "";
  const run = (action: () => Promise<unknown>, done: string) => action().then(() => { if (done) setNote(done); }).catch((error: unknown) => {
    // Feuille de partage fermée sans choisir : ce n'est pas une erreur.
    if (error instanceof Error && /cancel|abort/i.test(`${error.name} ${error.message}`)) return;
    setNote("Le partage n'a pas abouti.");
  });

  return (
    <section className="barcode-panel share-sheet">
      <div className="barcode-head">
        <strong>Partager {what}</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={15} /></button>
      </div>
      <p className="food-hint">« {name} » : le lien contient tout {payload.kind === "recette" ? "(ingrédients, étapes, valeurs)" : "(aliments et quantités)"}, sans les photos. La personne voit un aperçu et choisit de l'ajouter ou non.</p>
      {!link && !note && <p className="food-hint"><span className="loader" /> Préparation du lien…</p>}
      {link && (
        <div className="barcode-choices">
          <button type="button" className="add-part" onClick={() => void run(() => sendText(name, message).then((how) => { if (how === "copied") setNote("Message copié : colle-le dans une conversation."); }), "")}>
            <Icon name="share" size={16} /> Envoyer le lien
          </button>
          <button type="button" className="add-part" onClick={() => void run(() => navigator.clipboard.writeText(link), "Lien copié : colle-le dans un message.")}>
            <Icon name="link" size={16} /> Copier le lien
          </button>
          <button type="button" className="add-part" onClick={() => void run(() => sendFile(payload), Capacitor.isNativePlatform() ? "Fichier envoyé." : "Fichier enregistré dans tes téléchargements.")}>
            <Icon name="download" size={16} /> Envoyer le fichier JSON
          </button>
        </div>
      )}
      {long && <small className="barcode-hint">Lien long ({link!.length} caractères) : il risque d'être coupé dans un message Discord (2000 au maximum). Envoie plutôt le fichier.</small>}
      {note && <p className="food-hint" role="status">{note}</p>}
    </section>
  );
}

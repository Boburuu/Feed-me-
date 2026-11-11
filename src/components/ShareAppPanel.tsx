import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Capacitor, registerPlugin } from "@capacitor/core";
import Icon from "./Icon";
import { UPDATE_URL } from "../lib/appUpdate";

const AppShare = registerPlugin<{ copyApk: () => Promise<{ uri: string }> }>("AppShare");

/** Faire installer Feed Me à quelqu'un : un QR code à scanner, ou le fichier de l'app envoyé directement. */
export default function ShareAppPanel({ flash }: { flash: (message: string) => void }) {
  const [sending, setSending] = useState(false);
  // Fabriqué dans le téléphone, sans connexion : il mène toujours à la dernière version.
  const svg = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(UPDATE_URL);
    code.make();
    return code.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  }, []);

  const sendFile = async () => {
    setSending(true);
    try {
      const { uri } = await AppShare.copyApk();
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: "Feed Me", text: "Installe Feed Me : ouvre ce fichier, puis autorise l'installation si Android le demande.", files: [uri] });
    } catch {
      flash("L'envoi a été annulé ou n'a pas pu se faire");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="section-block share-app">
      <h2 className="set-title">Faire découvrir Feed Me</h2>
      <p className="theme-description">L'autre personne scanne ce code avec l'appareil photo de son téléphone Android : il télécharge la dernière version de Feed Me.</p>
      <div className="qr-box" role="img" aria-label="QR code pour télécharger Feed Me" dangerouslySetInnerHTML={{ __html: svg }} />
      <small className="theme-description">Il faut une connexion à Internet pour le téléchargement. Chrome peut afficher « fichier potentiellement dangereux » : c'est normal pour une app installée hors du Play Store.</small>
      {Capacitor.isNativePlatform() && (
        <>
          <p className="food-section">Sans Internet</p>
          <p className="theme-description">Envoie directement le fichier de ton app, par Quick Share ou Bluetooth, à un téléphone à côté de toi.</p>
          <button type="button" className="submit-button" onClick={sendFile} disabled={sending}><Icon name="share" /> {sending ? "Préparation…" : "Envoyer l'application"}</button>
          <small className="theme-description">Ce sera ta version de Feed Me ; la personne recevra ensuite les mises à jour comme toi. Tes données ne sont pas envoyées.</small>
        </>
      )}
    </section>
  );
}

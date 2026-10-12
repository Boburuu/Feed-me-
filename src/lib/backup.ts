import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { allImages } from "./images";
import { todayKey, type AppData } from "./storage";

/**
 * Exporte toutes les données dans un fichier JSON.
 * Navigateur : téléchargement. Téléphone : feuille de partage (Drive, mail, message…).
 */
export async function exportBackup(data: AppData) {
  const fileName = `feedme-sauvegarde-${todayKey()}.json`;
  // Les images des recettes vivent dans IndexedDB : on les joint au fichier.
  const images = await allImages().catch(() => ({}));
  const content = JSON.stringify({ ...data, images });

  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: "Sauvegarde Feed Me", files: [file.uri] });
    return;
  }

  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

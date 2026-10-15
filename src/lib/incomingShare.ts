// Lien de partage reçu par l'appli Android (lien touché dans une conversation).
//
// Le lien peut arriver alors que l'écran du code est affiché : il est gardé de côté, puis
// lu par l'écran principal une fois l'appli déverrouillée.

import { Capacitor } from "@capacitor/core";
import { shareInHash } from "./share";

const KEY = "feedme:partage-recu";
export const INCOMING_EVENT = "feedme:partage-recu";

function keep(url: string | undefined) {
  const hash = url && url.includes("#") ? url.slice(url.indexOf("#")) : "";
  const link = shareInHash(hash);
  if (!link) return;
  try { sessionStorage.setItem(KEY, link); } catch { /* lu tout de suite par l'événement */ }
  window.dispatchEvent(new CustomEvent(INCOMING_EVENT, { detail: link }));
}

/** À appeler une fois au démarrage : écoute les liens ouverts avec l'appli. */
export async function listenForSharedLinks() {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  // Appli lancée par le lien, ou déjà ouverte en arrière-plan.
  keep((await App.getLaunchUrl().catch(() => undefined))?.url);
  await App.addListener("appUrlOpen", ({ url }) => keep(url));
}

/** Lien reçu et pas encore montré (lu une seule fois). */
export function takeIncomingShare() {
  try {
    const link = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return link;
  } catch {
    return null;
  }
}

import { Capacitor } from "@capacitor/core";
import changelog from "../data/changelog.json";

/** Toujours la dernière version publiée. */
export const UPDATE_URL = "https://github.com/Boburuu/Feed-me-/releases/latest/download/feed-me.apk";
const LATEST_RELEASE_URL = "https://api.github.com/repos/Boburuu/Feed-me-/releases/latest";

const parts = (tag: string) => /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag.trim())?.slice(1).map((part) => Number(part ?? 0)) ?? null;

/** v1.10 est plus récente que v1.9 : on compare des nombres, pas du texte. */
export function isNewerVersion(latest: string, current: string) {
  const [next, now] = [parts(latest), parts(current)];
  if (!next || !now) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== now[index]) return next[index] > now[index];
  }
  return false;
}

const WHATS_NEW_KEY = "feedme:nouveautes-vues";

/** Les nouveautés d'une version publiée : ses lignes « - », en texte simple. */
export function releaseNotes(body: string | undefined) {
  return (body ?? "").split(/\r?\n/).filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim()).filter(Boolean).slice(0, 6);
}

/** Nouveautés à montrer à la première ouverture de cette version, une seule fois. */
export function whatsNew(tag: string, seen: string | null, notes: Record<string, string[]> = changelog) {
  return tag !== seen && notes[tag]?.length ? notes[tag] : null;
}

export function pendingWhatsNew() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return whatsNew(__APP_VERSION__.tag, window.localStorage.getItem(WHATS_NEW_KEY));
  } catch {
    return null;
  }
}

export function markWhatsNewSeen() {
  try { window.localStorage.setItem(WHATS_NEW_KEY, __APP_VERSION__.tag); } catch { /* Elles reviendront à la prochaine ouverture. */ }
}

export type UpdateCheck = { status: "new"; tag: string; notes: string[] } | { status: "latest" } | { status: "error" };

/** La version web se met à jour toute seule : seule l'app installée a besoin de chercher. */
export const canCheckUpdate = () => Capacitor.isNativePlatform();

/** Demande à GitHub le numéro de la dernière version publiée, rien de plus : aucune donnée n'est envoyée. */
export async function checkUpdate(current = __APP_VERSION__.tag): Promise<UpdateCheck> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: "error" };
    const { tag_name: latest, body } = (await response.json()) as { tag_name?: string; body?: string };
    return latest && isNewerVersion(latest, current) ? { status: "new", tag: latest, notes: releaseNotes(body) } : { status: "latest" };
  } catch {
    return { status: "error" };
  }
}

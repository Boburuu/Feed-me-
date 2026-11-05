import { Capacitor } from "@capacitor/core";

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

export type UpdateCheck = { status: "new"; tag: string } | { status: "latest" } | { status: "error" };

/** La version web se met à jour toute seule : seule l'app installée a besoin de chercher. */
export const canCheckUpdate = () => Capacitor.isNativePlatform();

/** Demande à GitHub le numéro de la dernière version publiée, rien de plus : aucune donnée n'est envoyée. */
export async function checkUpdate(current = __APP_VERSION__.tag): Promise<UpdateCheck> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: "error" };
    const { tag_name: latest } = (await response.json()) as { tag_name?: string };
    return latest && isNewerVersion(latest, current) ? { status: "new", tag: latest } : { status: "latest" };
  } catch {
    return { status: "error" };
  }
}

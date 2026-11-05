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

/**
 * Demande à GitHub le numéro de la dernière version publiée, rien de plus : aucune donnée n'est
 * envoyée. La version web se met à jour toute seule. Sans réseau, on ne dit rien.
 */
export async function findUpdate(current = __APP_VERSION__.tag): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const response = await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const { tag_name: latest } = (await response.json()) as { tag_name?: string };
    return latest && isNewerVersion(latest, current) ? latest : null;
  } catch {
    return null;
  }
}

// Corbeille : « Effacer toutes les données » et « Code oublié ? » ne suppriment plus rien
// pour de bon. Les données partent dans une corbeille gardée 30 jours, proposée à la
// restauration avant toute création de compte. Des données devenues illisibles y sont
// aussi mises de côté, au lieu d'être écrasées par un nouveau compte.

import { parseBackup, STORAGE_KEY, type AppData } from "./storage";

const TRASH_KEY = "feedme:corbeille";
const KEEP_DAYS = 30;
const KEEP_ENTRIES = 3;

export type TrashEntry = { deletedAt: string; raw: string; unreadable?: boolean };
export type TrashItem = TrashEntry & { data: AppData | null };

function read(): TrashEntry[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(TRASH_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((entry) => typeof entry?.raw === "string" && typeof entry?.deletedAt === "string") : [];
  } catch {
    return [];
  }
}

function write(list: TrashEntry[]) {
  try {
    if (list.length) window.localStorage.setItem(TRASH_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(TRASH_KEY);
    return true;
  } catch {
    // Stockage plein : on ne supprime rien.
    return false;
  }
}

const fresh = (entry: TrashEntry, now: number) => now - new Date(entry.deletedAt).getTime() < KEEP_DAYS * 86_400_000;

/**
 * Met les données actuelles à la corbeille, puis les retire. Si la corbeille ne peut pas être
 * écrite, rien n'est retiré (false).
 */
export function moveDataToTrash(unreadable = false, now = Date.now()) {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { return false; }
  if (!raw) return true;
  const list = [{ deletedAt: new Date(now).toISOString(), raw, ...(unreadable ? { unreadable: true } : {}) }, ...read().filter((entry) => fresh(entry, now))].slice(0, KEEP_ENTRIES);
  if (!write(list)) return false;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { return false; }
  return true;
}

/** Données effacées depuis moins de 30 jours, les plus récentes d'abord. */
export function trashItems(now = Date.now()): TrashItem[] {
  return read().filter((entry) => fresh(entry, now)).map((entry) => ({ ...entry, data: parseBackup(entry.raw)?.data ?? null }));
}

/** Données restaurées : on les retire de la corbeille. */
export function removeFromTrash(deletedAt: string) {
  write(read().filter((entry) => entry.deletedAt !== deletedAt));
}

/** Il reste quelque chose sous la clé des données, que l'app n'arrive pas à lire. */
export function unreadableDataPresent() {
  try { return !!window.localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

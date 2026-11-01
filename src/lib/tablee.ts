// « Ma tablée » : les prénoms des gens avec qui on mange souvent. La liste reste sur le
// téléphone ; elle sert à noter « Mangé avec » et à préparer les partages par message.

import { normalize } from "./foods";

const MAX_NAME = 40;

/** Prénom propre : espaces retirés, longueur bornée. */
export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/** Même personne, quelle que soit la casse ou les accents (« élodie » = « Élodie »). */
export const sameName = (a: string, b: string) => normalize(a) === normalize(b);

/** Ajoute des prénoms à une liste, sans doublon ni prénom vide. */
export function addNames(list: string[], names: string[]) {
  const next = [...list];
  for (const raw of names) {
    const name = cleanName(raw);
    if (name && !next.some((entry) => sameName(entry, name))) next.push(name);
  }
  return next;
}

/** « Alex », « Alex et Sam », « Alex, Sam et Lou ». */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

/**
 * Personnes avec qui on a mangé, vues depuis le téléphone qui reçoit le partage :
 * l'expéditeur et les autres invités, sans soi-même (reconnu par son prénom ou pseudo).
 */
export function companionsFor(from: string | undefined, guests: string[] | undefined, me: string[]) {
  const mine = me.filter(Boolean);
  const isMe = (name: string) => mine.some((entry) => sameName(entry, name));
  return addNames([], [from ?? "", ...(guests ?? [])]).filter((name) => !isMe(name));
}

/** Identifiant court et aléatoire d'un partage (sert à repérer un lien déjà ouvert). */
export const newShareId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

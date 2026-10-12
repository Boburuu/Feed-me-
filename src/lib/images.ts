// Images des recettes (captures d'écran, photo récupérée d'un site).
// Trop lourdes pour le localStorage (limité à ~5 Mo) : on les range dans IndexedDB,
// sous forme de data URL JPEG, avec un identifiant référencé par la recette.

import { useEffect, useState } from "react";

const DB_NAME = "feedme-images";
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putImage(dataUrl: string, id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  await run("readwrite", (store) => store.put(dataUrl, id));
  return id;
}

export const getImage = (id: string) => run<string | undefined>("readonly", (store) => store.get(id));
export const deleteImage = (id: string) => run("readwrite", (store) => store.delete(id));
export const clearImages = () => run("readwrite", (store) => store.clear()).catch(() => undefined);

export async function allImages() {
  const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
  const values = await run<string[]>("readonly", (store) => store.getAll());
  return Object.fromEntries(keys.map((key, index) => [String(key), values[index]]));
}

export async function restoreImages(images: Record<string, string>) {
  await clearImages();
  for (const [id, dataUrl] of Object.entries(images)) await putImage(dataUrl, id);
}

/** Charge une image pour l'afficher ; null tant qu'elle n'est pas prête. */
export function useImage(id: string | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (id) getImage(id).then((value) => alive && setSrc(value ?? null)).catch(() => undefined);
    return () => { alive = false; };
  }, [id]);
  return src;
}

/**
 * Réduit une image (fichier ou data URL) à 1600 px de côté maximum en JPEG.
 * 1600 px garde le texte d'une capture d'écran lisible pour ~200 Ko.
 */
export function shrinkImage(source: File | string, maxSide = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const load = (url: string) => {
      const image = new Image();
      image.onerror = () => reject(new Error("Image illisible"));
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Canvas indisponible"));
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      image.src = url;
    };
    if (typeof source === "string") return load(source);
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => load(String(reader.result));
    reader.readAsDataURL(source);
  });
}

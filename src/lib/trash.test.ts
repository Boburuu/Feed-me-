import { beforeEach, describe, expect, it } from "vitest";
import { moveDataToTrash, removeFromTrash, trashItems, unreadableDataPresent } from "./trash";
import { STORAGE_KEY } from "./storage";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  } } });
});

const data = (name: string) => JSON.stringify({ version: 1, profile: { firstName: name, lastName: "", pseudo: name, age: 30, sex: "femme", height: 165, weight: 80, activity: "1.4", photo: null, createdAt: "2026-10-11" }, pin: { salt: "a", hash: "b", length: 4 }, meals: [{ id: 1 }], plan: {}, theme: "sombre", water: {}, weights: [], steps: {}, recipes: [], sessions: [], fasts: [], tasks: [], leftovers: [], customFoods: [] });

describe("corbeille", () => {
  it("garde les données effacées au lieu de les supprimer", () => {
    store.set(STORAGE_KEY, data("Camille"));
    expect(moveDataToTrash()).toBe(true);
    expect(store.has(STORAGE_KEY)).toBe(false);
    const [item] = trashItems();
    expect(item.data?.profile.firstName).toBe("Camille");
  });

  it("un nouveau compte effacé ensuite ne fait pas disparaître l'ancien", () => {
    store.set(STORAGE_KEY, data("Camille"));
    moveDataToTrash(false, Date.parse("2026-11-11T12:00:00Z"));
    store.set(STORAGE_KEY, data("Essai"));
    moveDataToTrash(false, Date.parse("2026-11-11T13:00:00Z"));
    expect(trashItems(Date.parse("2026-11-12T00:00:00Z")).map((item) => item.data?.profile.firstName)).toEqual(["Essai", "Camille"]);
  });

  it("oublie ce qui a plus de 30 jours", () => {
    store.set(STORAGE_KEY, data("Camille"));
    moveDataToTrash(false, Date.parse("2026-11-11T12:00:00Z"));
    expect(trashItems(Date.parse("2026-12-20T00:00:00Z"))).toEqual([]);
  });

  it("met de côté des données illisibles", () => {
    store.set(STORAGE_KEY, "{abîmé");
    expect(unreadableDataPresent()).toBe(true);
    moveDataToTrash(true);
    const [item] = trashItems();
    expect([item.unreadable, item.data, item.raw]).toEqual([true, null, "{abîmé"]);
  });

  it("restaurer retire de la corbeille", () => {
    store.set(STORAGE_KEY, data("Camille"));
    moveDataToTrash();
    removeFromTrash(trashItems()[0].deletedAt);
    expect(trashItems()).toEqual([]);
  });

  it("ne supprime rien si la corbeille ne peut pas être écrite", () => {
    store.set(STORAGE_KEY, data("Camille"));
    (window as unknown as { localStorage: { setItem: () => void } }).localStorage.setItem = () => { throw new Error("plein"); };
    expect(moveDataToTrash()).toBe(false);
    expect(store.has(STORAGE_KEY)).toBe(true);
  });
});

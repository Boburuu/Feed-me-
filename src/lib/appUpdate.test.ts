import { describe, expect, it } from "vitest";
import { isNewerVersion, releaseNotes, whatsNew } from "./appUpdate";

describe("isNewerVersion", () => {
  it("compare les numéros, pas le texte", () => {
    expect(isNewerVersion("v1.10", "v1.9")).toBe(true);
    expect(isNewerVersion("v2.0", "v1.10")).toBe(true);
    expect(isNewerVersion("v1.9.1", "v1.9")).toBe(true);
  });

  it("ne propose ni la même version ni une plus ancienne", () => {
    expect(isNewerVersion("v1.9", "v1.9")).toBe(false);
    expect(isNewerVersion("v1.9", "v1.10")).toBe(false);
  });

  it("ne propose rien si un numéro est illisible", () => {
    expect(isNewerVersion("test-12", "v1.9")).toBe(false);
    expect(isNewerVersion("v1.10", "")).toBe(false);
  });
});

describe("nouveautés", () => {
  it("garde seulement les lignes de la liste", () => {
    expect(releaseNotes("- Pâtes corrigées\r\n- Profil corrigé\n\n**Installer sur Android** : ouvrez-le.")).toEqual(["Pâtes corrigées", "Profil corrigé"]);
    expect(releaseNotes(undefined)).toEqual([]);
  });

  it("ne les montre qu'une fois, et seulement si la version en a", () => {
    const notes = { "v1.12": ["Pâtes corrigées"] };
    expect(whatsNew("v1.12", "v1.11", notes)).toEqual(["Pâtes corrigées"]);
    expect(whatsNew("v1.12", null, notes)).toEqual(["Pâtes corrigées"]);
    expect(whatsNew("v1.12", "v1.12", notes)).toBeNull();
    expect(whatsNew("v1.13", "v1.12", notes)).toBeNull();
  });
});

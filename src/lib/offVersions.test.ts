// Doublons Open Food Facts : une ligne par produit, la version française d'abord.
import { describe, expect, it } from "vitest";
import { countryOf, groupVersions, type WithMeta } from "./offVersions";

const fiche = (code: string, name: string, brand: string | undefined, kcal100: number, country: string, completeness = 0.5, quantity?: string): WithMeta => ({
  name, brand, source: "off", ref: code, kcal100, protein100: 0, detail: "Open Food Facts",
  meta: { ...countryOf([`en:${country}`]), completeness, scans: 0, quantity },
});

describe("versions d'un même produit", () => {
  // Les « Ice Tea Framboise » de la capture : Canada, France, sans marque, Maroc.
  const results = [
    fiche("0161650112588", "Ice Tea Framboise", "Lipton", 20, "canada", 0.3),
    fiche("3000000000001", "ICE tea framboise", undefined, 22, "france", 0.4, "1,5 L"),
    fiche("3000000000002", "Ice tea framboise", "Lipton", 19, "morocco", 0.8, "33 cl"),
    fiche("3000000000003", "Ice tea framboise et fleur de cerisier", "Lipton", 19, "france"),
    fiche("3000000000004", "Arizona, iced tea, raspberry", "Arizona", 38, "united-states"),
  ];
  const grouped = groupVersions(results);

  it("un seul « Ice Tea Framboise », la version française d'abord", () => {
    expect(grouped.map((item) => item.name)).toEqual(["ICE tea framboise", "Ice tea framboise et fleur de cerisier", "Arizona, iced tea, raspberry"]);
    expect(grouped[0].versionLabel).toBe("France · 1,5 L");
    expect(grouped[0].versions?.map((item) => item.versionLabel)).toEqual(["Maroc · 33 cl", "Canada"]);
  });

  it("deux marques différentes ou des valeurs trop éloignées ne sont pas fusionnées", () => {
    const other = groupVersions([fiche("1", "Thé glacé pêche", "Lipton", 20, "france"), fiche("2", "Thé glacé pêche", "Fuze", 20, "france"), fiche("3", "Thé glacé pêche", "Lipton", 40, "france")]);
    expect(other).toHaveLength(3);
  });

  it("pays lisible", () => {
    expect(countryOf(["en:world", "en:morocco"]).country).toBe("Maroc");
    expect(countryOf(["en:belgium", "en:france"])).toEqual({ france: true, country: "France" });
  });
});

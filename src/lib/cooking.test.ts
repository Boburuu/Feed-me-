// Cru ou cuit (cahier v2 § 7) : la fiche Ciqual cuite plutôt qu'un facteur approximatif.
import { describe, expect, it } from "vitest";
import ciqual from "../data/ciqual.json";
import { cookingBase, cookingLabel, cookKey, suggestCookingFat, variantsIn } from "./cooking";
import type { CiqualRow } from "./foods";

const rows = (ciqual as unknown as { foods: CiqualRow[] }).foods;
const variants = (name: string) => variantsIn(rows, { source: "ciqual", name });

describe("fiches crue et cuites (Ciqual)", () => {
  it("filet de poulet : cru 110 kcal, sauté/poêlé 141 kcal, sans les variantes bio", () => {
    const list = variants("Poulet, filet, sans peau, cru");
    expect(list.map((variant) => `${variant.label} ${variant.kcal100}`)).toEqual(["cru 110", "sauté/poêlé 141"]);
    expect(list[0].raw).toBe(true);
  });

  it("cabillaud : cru, vapeur, au four… ; steak haché 5 % : cru et cuit", () => {
    expect(variants("Cabillaud, cru").map((variant) => variant.label)).toEqual(expect.arrayContaining(["cru", "cuit à la vapeur", "rôti/cuit au four"]));
    expect(variants("Boeuf, steak haché 5% MG, cru").map((variant) => variant.kcal100)).toEqual([130, 155]);
  });

  it("depuis la fiche cuite, on retrouve aussi la crue", () => {
    expect(variants("Boeuf, steak haché 5% MG, cuit").some((variant) => variant.raw)).toBe(true);
  });

  it("pas de choix pour ce qui n'est pas une simple cuisson (pané, fumé) ni pour Open Food Facts", () => {
    expect(variants("Saumon fumé")).toEqual([]);
    expect(variantsIn(rows, { source: "off", name: "Filet de poulet, cru" })).toEqual([]);
  });

  it("nom de base et mode de cuisson", () => {
    expect(cookingBase("Poulet, filet, sans peau, sauté/poêlé")).toBe("poulet filet sans peau");
    expect(cookingLabel("Cabillaud, rôti/cuit au four")).toBe("rôti/cuit au four");
    expect(cookKey({ source: "ciqual", name: "Poulet, filet, sans peau, cru" })).toBe(cookKey({ source: "ciqual", name: "Poulet, filet, sans peau, sauté/poêlé" }));
  });
});

describe("matière grasse de cuisson", () => {
  it("proposée pour une viande crue ou un aliment poêlé, pas si l'huile est déjà notée", () => {
    expect(suggestCookingFat([{ name: "Poulet, filet, sans peau, cru" }])).toBe(true);
    expect(suggestCookingFat([{ name: "Poulet, filet, sans peau, sauté/poêlé" }])).toBe(true);
    expect(suggestCookingFat([{ name: "Poulet, filet, sans peau, cru" }, { name: "Huile d'olive" }])).toBe(false);
    expect(suggestCookingFat([{ name: "Banane" }])).toBe(false);
  });
});

describe("sucres, saturés, fibres, sel (Ciqual 2020)", () => {
  it("lentilles corail sèches : 15,4 g de fibres et 1,29 g de sucres pour 100 g", () => {
    const row = rows.find((entry) => entry[1] === "Lentille corail, sèche")!;
    expect(row.slice(7)).toEqual([1.29, 0.14, 15.4, 0]);
  });

  it("toutes les fiches ont reçu leurs quatre valeurs (ou « inconnu »)", () => {
    expect(rows.every((row) => row.length === 11)).toBe(true);
  });
});

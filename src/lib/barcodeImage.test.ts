// Code-barres saisi à la main (cahier § 10.2) : un code mal recopié est refusé avant la recherche.
import { describe, expect, it } from "vitest";
import { cleanProductCode, codesInText, isValidProductCode } from "./barcodeImage";

describe("codes-barres de produits", () => {
  it("accepte un EAN-13 et un EAN-8 valides", () => {
    expect(isValidProductCode("5060947541184")).toBe(true); // Monster Ultra Rosá
    expect(isValidProductCode("42391760")).toBe(true); // Kong Strong
  });
  it("refuse un chiffre faux, manquant, ou des lettres", () => {
    expect(isValidProductCode("5060947541185")).toBe(false);
    expect(isValidProductCode("506094754118")).toBe(false);
    expect(isValidProductCode("50609475411AB")).toBe(false);
  });
  it("tolère espaces et tirets à la saisie", () => {
    expect(cleanProductCode("5 060947 541184")).toBe("5060947541184");
    expect(cleanProductCode("5060-9475-41184")).toBe("5060947541184");
    expect(cleanProductCode("123")).toBeNull();
  });
});

describe("chiffres imprimés sous les barres", () => {
  it("retrouve le code dans le texte lu, espaces compris", () => {
    expect(codesInText("Monster\n5 060947 541184\n500 ml")).toEqual(["5060947541184"]);
  });

  it("ignore les nombres qui ne sont pas des codes (prix, poids, chiffre de contrôle faux)", () => {
    expect(codesInText("Prix 2,49 € · 500 g · lot 12345678 · 5060947541185")).toEqual([]);
  });

  it("code collé à d'autres chiffres : les 13 derniers suffisent", () => {
    expect(codesInText("99 5060947541184")).toContain("5060947541184");
  });
});

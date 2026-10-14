// Code-barres saisi à la main (cahier § 10.2) : un code mal recopié est refusé avant la recherche.
import { describe, expect, it } from "vitest";
import { cleanProductCode, isValidProductCode } from "./barcodeImage";

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

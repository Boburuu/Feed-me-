// Lecture d'étiquette et comparaison (cahier § 11) : sachet « poulet rôti » de la capture,
// 124 kcal/100 g et 281 kcal pour 225 g, alors que l'app affichait 131 kcal/100 g.
import { describe, expect, it } from "vitest";
import { compareWithLabel, parseNutritionLabel, type OcrBox } from "./nutritionLabel";

// Rangées telles que la reconnaissance de texte les rend (une case = un morceau de texte).
const box = (text: string, x: number, y: number): OcrBox => ({ text, x, y, w: 80, h: 20 });
const sachet: OcrBox[] = [
  box("Valeurs Nutritionnelles", 0, 0), box("pour 100 g", 200, 0), box("par portion de 225 g", 320, 2), box("% des AQR* par portion", 460, 0),
  box("Énergie", 0, 40), box("521 kJ", 200, 38), box("1181kJ", 320, 40), box("14%", 460, 40),
  box("124 kcal", 200, 62), box("281 kcal", 320, 63),
  box("Matières grasses", 0, 100), box("4,5 g", 200, 100), box("10 g", 320, 101), box("14%", 460, 100),
  box("dont acides gras saturés", 0, 124), box("0,6 g", 200, 124), box("1,4 g", 320, 124), box("7%", 460, 124),
  box("Glucides", 0, 160), box("14 g", 200, 160), box("32 g", 320, 160), box("12%", 460, 160),
  box("dont sucres", 0, 184), box("0 g", 200, 184), box("0 g", 320, 184), box("0%", 460, 184),
  box("Fibres alimentaires", 0, 210), box("1,6 g", 200, 210), box("3,6 g", 320, 210),
  box("Protéines", 0, 236), box("6,1 g", 200, 236), box("14 g", 320, 236), box("27%", 460, 236),
  box("Sel", 0, 262), box("0,61 g", 200, 262), box("1,4 g", 320, 262), box("23%", 460, 262),
];

describe("lecture du tableau nutritionnel", () => {
  const reading = parseNutritionLabel(sachet);

  it("lit les valeurs pour 100 g, sans les pourcentages d'AQR", () => {
    expect(reading.per100).toEqual({ kcal: 124, fat: 4.5, satFat: 0.6, carbs: 14, sugars: 0, fiber: 1.6, protein: 6.1, salt: 0.61 });
  });

  it("lit la portion et ses valeurs (225 g, 281 kcal)", () => {
    expect(reading.portionGrams).toBe(225);
    expect(reading.perPortion).toMatchObject({ kcal: 281, fat: 10, carbs: 32, protein: 14 });
  });

  it("canette de boisson : base 100 ml, kJ seuls convertis en kcal", () => {
    const canette = parseNutritionLabel(["INFORMATIONS NUTRITIONNELLES POUR 100ml POUR 500ml", "ENERGIE 153 kJ 767 kJ", "GLUCIDES 9,0g 45g", "DONT SUCRES 8,5g 43g", "SEL 0,04g 0,20g"]);
    expect(canette.base).toBe("100 ml");
    expect(canette.per100).toMatchObject({ kcal: 37, carbs: 9, sugars: 8.5, salt: 0.04 });
  });

  it("valeur impossible (« 3,2 g » lu « 329 ») : laissée vide, à taper", () => {
    const lu = parseNutritionLabel(["Valeurs nutritionnelles pour 100 ml", "Énergie 60 kJ / 14 kcal", "Glucides 329 16 g", "Sel 0,19 g 0,95 g"]);
    expect(lu.per100.carbs).toBeUndefined();
    expect(lu.unsure).toEqual(["carbs"]);
    expect(lu.per100).toMatchObject({ kcal: 14, salt: 0.19 });
  });
});

describe("comparaison avec la fiche", () => {
  it("131 contre 124 kcal : écart de 5,6 %, dans la tolérance des arrondis", () => {
    const [energy] = compareWithLabel({ kcal: 131 }, { kcal: 124 });
    expect(energy.gap).toBeCloseTo(5.6, 1);
    expect(energy.status).toBe("ok");
  });

  it("signale un vrai écart, et ce qui manque d'un côté", () => {
    const rows = compareWithLabel({ kcal: 269, fat: 20 }, { kcal: 200, fat: 12, protein: 20 });
    expect(rows.find((row) => row.key === "kcal")?.status).toBe("check");
    expect(rows.find((row) => row.key === "fat")?.status).toBe("check");
    expect(rows.find((row) => row.key === "protein")?.status).toBe("missing");
  });

  it("281 kcal pour 225 g contre 279 calculés : arrondi, pas une erreur", () => {
    expect(compareWithLabel({ kcal: (124 * 225) / 100 }, { kcal: 281 })[0].status).toBe("ok");
  });
});

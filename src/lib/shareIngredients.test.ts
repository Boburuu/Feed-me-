// Partage d'ingrédients (« Mes ingrédients ») : lien aller-retour, sans les champs propres à l'appareil.
import { describe, expect, it } from "vitest";
import { ingredientsPayload, readShare, shareLink } from "./share";
import { toPantry } from "./pantry";

const cheddar = toPantry({ name: "Burger cheddar & emmental · Président", source: "off", ref: "3032220061377", kcal100: 215, protein100: 14, carbs100: 6, fat100: 15, quantity: 1, unit: "portion", portionGrams: 17, portionLabel: "1 tranche", pieceGrams: 17, pieceLabel: "1 tranche", packageGrams: 340 }, 1, "2026-10-28");
const perso = toPantry({ name: "Ma pâte à tartiner", source: "perso", ref: "42", kcal100: 520, protein100: 6, quantity: 100, unit: "g" }, 2, "2026-10-28");

describe("partage d'ingrédients", () => {
  it("le lien redonne les produits, leur tranche et leur paquet", async () => {
    const received = await readShare(await shareLink(ingredientsPayload([cheddar, perso])));
    expect(received.kind).toBe("ingredients");
    if (received.kind !== "ingredients") return;
    expect(received.products).toHaveLength(2);
    expect(received.products[0]).toMatchObject({ name: cheddar.name, ref: "3032220061377", kcal100: 215, pieceGrams: 17, pieceLabel: "1 tranche", packageGrams: 340 });
    // Rien de propre au téléphone de l'expéditeur : ni numéro de liste, ni référence d'aliment perso.
    expect(received.products[0]).not.toHaveProperty("pantryId");
    expect(received.products[1].ref).toBeUndefined();
  });
});

// Boissons énergisantes vendues en France, par marque et par parfum.
//
// Ciqual ne connaît que « boisson énergisante, sucrée / sans sucre ». Ces produits de
// marque viennent d'Open Food Facts (octobre 2026) : pour chacun, la valeur médiane des
// fiches françaises cohérentes, en kcal pour 100 ml. Embarquées dans l'app : la liste
// marche hors ligne, et sans souci d'accents (« Ultra Rosá »). Le scan du code-barres
// reste le plus précis pour un produit donné.

export type EnergyDrink = {
  name: string;
  brand: string;
  kcal100: number;
  /** Contenance de la canette habituelle, en ml. */
  can: number;
  /** Autres façons de la chercher (sans accents). */
  aliases?: string[];
};

const monster = (name: string, kcal100: number, aliases: string[] = []): EnergyDrink => ({ name: `Monster ${name}`, brand: "Monster", kcal100, can: 500, aliases });
const redBull = (name: string, kcal100: number, aliases: string[] = []): EnergyDrink => ({ name: `Red Bull ${name}`, brand: "Red Bull", kcal100, can: 250, aliases });

export const energyDrinks: EnergyDrink[] = [
  monster("Energy (original, vert)", 47, ["monster", "monster energy", "monster vert", "monster original"]),
  monster("Zero Sugar", 3, ["monster zero", "monster zero sugar", "monster sans sucre", "absolutely zero"]),
  monster("Ultra White", 2, ["monster ultra", "ultra white", "monster blanc", "monster ultra blanc"]),
  // Étiquette de la canette : 12 kJ/100 ml (affiché « 3 kcal » arrondi), 14 kcal les 500 ml.
  monster("Ultra Rosá", 2.8, ["ultra rosa", "monster rose", "monster rosa"]),
  monster("Ultra Paradise", 3, ["ultra paradise"]),
  monster("Ultra Watermelon", 3, ["ultra watermelon", "monster pasteque"]),
  monster("Ultra Fiesta Mango", 3, ["ultra fiesta", "fiesta mango"]),
  monster("Ultra Violet", 3, ["ultra violet"]),
  monster("Ultra Blue", 3, ["ultra blue", "monster bleu"]),
  monster("Ultra Gold", 2, ["ultra gold", "golden pineapple"]),
  monster("Ultra Peachy Keen", 3, ["ultra peachy", "peachy keen"]),
  monster("Ultra Strawberry Dreams", 2, ["strawberry dreams", "ultra strawberry"]),
  monster("Juiced Mango Loco", 37, ["mango loco"]),
  monster("Juiced Pipeline Punch", 38, ["pipeline punch", "monster punch"]),
  monster("Juiced Monarch", 37, ["monarch"]),
  monster("Juiced Bad Apple", 36, ["bad apple"]),
  monster("Juiced Aussie Lemonade", 42, ["aussie lemonade", "monster lemonade"]),
  monster("Juiced Khaos", 33, ["khaos"]),
  monster("Juiced Ripper", 37, ["ripper"]),
  monster("The Doctor (VR46)", 44, ["the doctor", "vr46"]),
  monster("Assault", 42, ["assault"]),
  monster("Nitro Cosmic Peach", 47, ["nitro", "cosmic peach"]),
  monster("Reserve Watermelon", 25, ["reserve watermelon"]),
  monster("Rehab Thé citron", 10, ["rehab", "monster the citron"]),

  redBull("Energy Drink", 46, ["red bull", "redbull"]),
  redBull("Sugarfree", 3, ["red bull sans sucre", "red bull sugar free", "sugarfree"]),
  redBull("Zero", 2, ["red bull zero"]),
  redBull("Summer Edition", 46, ["red bull summer", "red bull ete"]),
  redBull("Winter Edition", 45, ["red bull winter", "red bull hiver"]),
  redBull("Tropical Edition (jaune)", 46, ["red bull tropical", "yellow edition", "red bull jaune"]),
  redBull("Blue Edition (myrtille)", 46, ["red bull blue", "red bull myrtille", "red bull bleu"]),
  redBull("Red Edition (pastèque)", 45, ["red bull red edition", "red bull pasteque", "watermelon edition"]),
  redBull("Açaï Edition sans sucre", 2, ["red bull acai"]),

  { name: "Burn Original", brand: "Burn", kcal100: 56, can: 500, aliases: ["burn", "burn energy"] },
  { name: "Burn Zéro", brand: "Burn", kcal100: 3, can: 500, aliases: ["burn zero", "burn sans sucre"] },

  { name: "Rockstar Original", brand: "Rockstar", kcal100: 55, can: 500, aliases: ["rockstar", "rockstar energy"] },
  { name: "Rockstar Sugar Free", brand: "Rockstar", kcal100: 3, can: 500, aliases: ["rockstar zero", "rockstar sans sucre"] },

  { name: "Kong Strong (réduit en sucre)", brand: "Kong Strong", kcal100: 23, can: 250, aliases: ["kong strong", "kongstrong", "strong kong", "strongkong", "kong", "kong strong lidl", "urban classic"] },
  { name: "Kong Strong Sans sucre", brand: "Kong Strong", kcal100: 3, can: 250, aliases: ["kong strong zero", "kong strong sugarfree", "kong strong sans sucre"] },
  { name: "Kong Strong Wild Power", brand: "Kong Strong", kcal100: 43, can: 500, aliases: ["wild power", "kong strong wild power"] },

  { name: "Hell Energy Classic", brand: "Hell", kcal100: 46, can: 250, aliases: ["hell", "hell energy"] },
  { name: "Hell Energy Sugarfree", brand: "Hell", kcal100: 2, can: 250, aliases: ["hell zero", "hell sans sucre"] },

  { name: "Dark Dog", brand: "Dark Dog", kcal100: 39, can: 250, aliases: ["dark dog", "darkdog"] },

  { name: "Crazy Tiger Original", brand: "Crazy Tiger", kcal100: 20, can: 500, aliases: ["crazy tiger"] },
  { name: "Crazy Tiger Zéro", brand: "Crazy Tiger", kcal100: 3, can: 500, aliases: ["crazy tiger zero", "crazy tiger sans sucre"] },

  { name: "XL Energy", brand: "XL", kcal100: 47, can: 250, aliases: ["xl energy", "xl"] },
  { name: "Celsius", brand: "Celsius", kcal100: 3, can: 355, aliases: ["celsius"] },
];

/** Marques, dans l'ordre de la liste. */
export const energyBrands = [...new Set(energyDrinks.map((drink) => drink.brand))];

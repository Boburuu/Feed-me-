// KFC France : calories officielles du document « Informations Nutri-Score » (version du
// 31/07/2026), fourni par Camille depuis le site de KFC (scripts/data/kfc-releves.tsv). KFC ne
// publie que les kcal par produit : protéines, glucides et lipides restent inconnus.
//
// [nom, catégorie, kcal par produit]
export type KfcRow = [string, string, number];

export const KFC_SOURCE = { name: "KFC France", url: "https://www.kfc.fr/informations-nutri-score", date: "2026-07-31" };

export const kfc: KfcRow[] = [
  ["iTwist", "Wraps & tortillas", 276],
  ["Crispy Burger Fish Spicy", "Burgers", 372],
  ["Crispy Burger Fish", "Burgers", 382],
  ["Boxmaster Veggie", "Wraps & tortillas", 636],
  ["Boxmaster Original", "Wraps & tortillas", 686],
  ["Krunchy Fish", "Burgers", 280],
  ["Krunchy", "Burgers", 288],
  ["Crispy Burger Spicy", "Burgers", 383],
  ["Crispy Burger", "Burgers", 406],
  ["Colonel Original Fish", "Burgers", 515],
  ["Colonel Original Veggie", "Burgers", 585],
  ["Colonel Original", "Burgers", 607],
  ["Tower Spicy", "Burgers", 624],
  ["Boxmaster Spicy", "Wraps & tortillas", 654],
  ["Colonel Bacon Veggie", "Burgers", 672],
  ["Tower Cheese & Bacon Veggie", "Burgers", 684], // lecture à confirmer (683,6 lu ; 603,6 possible sur l'image)
  ["Colonel Original Bacon", "Burgers", 698],
  ["Kentucky Veggie Burger", "Burgers", 698],
  ["Tower Cheese & Bacon", "Burgers", 706],
  ["Kentucky BBQ & Bacon", "Burgers", 806],
  ["Double Kentucky BBQ & Bacon", "Burgers", 1012],
  ["Tomates cerises", "Frites & accompagnements", 15],
  ["Petite salade", "Frites & accompagnements", 12],
  ["Cobette", "Frites & accompagnements", 131],
  ["Moyenne frite", "Frites & accompagnements", 226],
  ["Grande frite", "Frites & accompagnements", 316],
  ["Kentucky Fries", "Frites & accompagnements", 510],
  ["5 Onion Rings", "Poulet & snacks", 195],
  ["2 Tenders", "Poulet & snacks", 292],
  ["10 Onion Rings", "Poulet & snacks", 390],
  ["3 Crousti' Fromage", "Poulet & snacks", 205],
  ["5 Crousti' Fromage", "Poulet & snacks", 342],
  ["3 Hot Wings", "Poulet & snacks", 486],
  ["10 Crousti' Fromage", "Poulet & snacks", 684],
  ["Cornichon iTwist", "Wraps & tortillas", 339],
  ["Cornichon Burger", "Burgers", 564],
  ["Cornichon Burger Double Filet", "Burgers", 841],
  ["Double Boxmaster", "Wraps & tortillas", 1117],
  ["Saucy Burger", "Burgers", 596],
  ["Saucy Boxmaster", "Wraps & tortillas", 721],
  ["Mini Sundae Oasis", "Desserts", 136],
  ["Crousti' Kream M&M's Chocolat", "Desserts", 207],
  ["Sundae Oasis", "Desserts", 211],
];

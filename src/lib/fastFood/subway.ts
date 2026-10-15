// Subway France : calories officielles (document « Informations nutritionnelles et allergènes »,
// subwayfrance.fr, imprimé en octobre 2025, relevé le 16/10/2026). Subway ne publie que les
// kcal : protéines, glucides et lipides restent inconnus. Sandwichs pour un SUB 15 cm
// (« doubler les valeurs pour un SUB 30 cm », selon le document).
//
// [nom, catégorie, kcal, portion]
export type SubwayRow = [string, string, number, string];

export const SUBWAY_SOURCE = {
  name: "Subway France",
  url: "https://sasubwaystrapiprod.blob.core.windows.net/strapi-uploads/assets/A2_NUTRISCORE_ALLERGENNES_2024_Dec_20708559b2.pdf",
  date: "2026-10-16",
};

export const subway: SubwayRow[] = [
  ["Chicken Bella Mozza", "Sandwichs", 397, "1 SUB 15 cm"],
  ["Texan Steakhouse", "Sandwichs", 434, "1 SUB 15 cm"],
  ["Supreme Steak & Cheese", "Sandwichs", 416, "1 SUB 15 cm"],
  ["Deli Pastrami", "Sandwichs", 307, "1 SUB 15 cm"],
  ["Poulet Teriyaki", "Sandwichs", 258, "1 SUB 15 cm"],
  ["Galette de légumes végan", "Sandwichs", 259, "1 SUB 15 cm"],
  ["Dinde", "Sandwichs", 229, "1 SUB 15 cm"],
  ["Veggie Quinoa Kale", "Sandwichs", 393, "1 SUB 15 cm"],
  ["Veggie Delite", "Sandwichs", 276, "1 SUB 15 cm"],
  ["Jambon", "Sandwichs", 262, "1 SUB 15 cm"],
  ["Bœuf Pastrami", "Sandwichs", 278, "1 SUB 15 cm"],
  ["Poulet Tikka", "Sandwichs", 350, "1 SUB 15 cm"],
  ["Subway Steak & Cheese", "Sandwichs", 272, "1 SUB 15 cm"],
  ["Deli Melt", "Sandwichs", 312, "1 SUB 15 cm"],
  ["Poulet nature", "Sandwichs", 318, "1 SUB 15 cm"],
  ["Thon", "Sandwichs", 407, "1 SUB 15 cm"],
  ["Steakhouse Melt", "Sandwichs", 362, "1 SUB 15 cm"],
  ["Deli B.M.T", "Sandwichs", 395, "1 SUB 15 cm"],
  ["Gauf'fries", "Frites & accompagnements", 184, "1 portion (100 g)"],
  ["Röstis x4", "Frites & accompagnements", 125, "1 portion"],
  ["Crousti Chicken x4", "Poulet & snacks", 199, "1 portion"],
  ["Donut sucre", "Desserts", 201, "1 donut"],
  ["Donut chocolat", "Desserts", 240, "1 donut"],
  ["Brownie", "Desserts", 323, "1 brownie"],
  ["Cookie", "Desserts", 232, "1 cookie"],
];

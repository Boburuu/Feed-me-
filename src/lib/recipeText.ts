// Découpe le texte d'une recette (lu sur une capture d'écran ou collé depuis Instagram)
// en titre, portions, temps, parties, ingrédients et étapes.
//
// C'est une lecture « au mieux » : l'utilisateur vérifie toujours le résultat dans
// le formulaire avant d'enregistrer.

import { guessCategory, parseIngredientLine } from "./recipes";
import type { IngredientGroup, RecipeCategory, RecipeStep, StepGroup } from "./storage";

export type ParsedRecipe = {
  name: string;
  portions: number | null;
  time: number | null;
  category: RecipeCategory | null;
  /** Valeurs par portion écrites dans la recette (« 339 kcal – 36 g P »). */
  calories: number | null;
  protein: number | null;
  ingredients: IngredientGroup[];
  steps: StepGroup[];
};

// --- Nettoyage -------------------------------------------------------------------------

/** Lignes d'interface Instagram / TikTok, pas de la recette. */
const noise = [
  /^@\S+$/,
  /^[a-z0-9]*[._][a-z0-9._]+$/,
  /^(#\S+\s*)+$/,
  /\b(j['’]aime|likes?|commentaires?|comments?|vues|views|abonn[ée]s?|followers)\b/i,
  /^(voir (la|les|plus)|see (translation|more)|suivre|follow|partager|share|enregistrer|r[ée]pondre|reply|envoyer|message|sponsoris[ée]|audio original|original audio|reels?|publications?|accueil|rechercher)\b/i,
  /^il y a \d+/i,
  /^\d+\s*(s|min|h|j|sem|w|d)$/i,
  /^\d{1,2}[:h]\d{2}\b.*(%|4g|5g|lte|wifi)?$/i,
  /^[\d\s.,kKmM]+$/,
  /^(plus|more|…|\.\.\.)$/i,
];

const keycap = /(\d)️?⃣/g;
const pictographs = /[\p{Extended_Pictographic}️‍]/gu;

function cleanLine(raw: string) {
  return raw
    .replace(keycap, "$1. ")
    .replace(pictographs, " ")
    .replace(/^[\s•·*▪◦►▶→⇒✓✔|>]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Reconnaissance des lignes -----------------------------------------------------------

const ingredientHeader = /^(?:les\s+)?ingr[ée]dients?\b[\s:]*(.*?)\s*:?\s*$/i;
const stepsHeader = /^(?:la\s+)?(?:pr[ée]paration|[ée]tapes?|instructions?|m[ée]thode|d[ée]roul[ée]|r[ée]alisation|recette|progression|steps?|directions?)\b(?!\s*\d)[\s:]*(.*?)\s*:?\s*$/i;
const portionsPattern = /(?:pour\s+)?(\d+)\s*(?:à\s*\d+\s*)?(?:personnes?|pers\.?|parts?|portions?|people|servings?|couverts?|cookies|muffins|biscuits|pi[èe]ces|cr[êe]pes|pancakes|verrines|bols?)\b/i;
const timePattern = /(pr[ée]paration|pr[ée]pa|cuisson|repos|total|temps)\s*:?\s*(\d+)\s*(h|heures?|min|mn|minutes?)\s*(\d+)?/gi;
// Pas de drapeau « i » : « 2 Mélanger » est une étape, « 2 pavés de saumon » un ingrédient.
const numbered = /^(?:[ÉéEe]tape\s*)?(\d{1,2})\s*(?:[.)\-–:/]|\s(?=[A-ZÀ-ÝÉ]))\s*(.*)$/;
const verbs = /^(?:m[ée]lang|ajout|fai[st]|pr[ée]chauff|vers|cui[st]|coup|batt|incorpor|laiss|mett|enfourn|serv|dispos|[ée]tal|fouett|[ée]minc|[ée]pluch|hach|r[ée]serv|plac|r[ée]part|assaisonn|sal|poivr|napp|garn|form|roul|p[ée]tr|chauff|d[ée]coup|rinc|[ée]goutt|port|plong|retir|sort|d[ée]moul|lav|press|r[ée]dui|fond|torr[ée]fi|saisi|dor|badigeon|parsem|d[ée]glac|remu|tamis|monte|beurr|farin|graiss|chemis|d[ée]pos|fe?r?me|recouvr|couvr|r[ée]fri|congel|mix|blend|bake|mix|add|stir|cook|preheat|pour|place|serve)\w*/i;

const isNoise = (line: string) => noise.some((pattern) => pattern.test(line));

/** « 1 portion – 339 kcal – 36 g P – 19 g G – 14 g L », « Protéines : 36 g » : valeurs, pas un ingrédient. */
const kcalPattern = /(\d+(?:[.,]\d+)?)\s*kcal\b(?!\s*\/\s*100)/i;
const proteinPattern = /(\d+(?:[.,]\d+)?)\s*g\s*(?:de\s+)?(?:P\b|prot)|prot[ée]ines?\s*:?\s*(\d+(?:[.,]\d+)?)\s*g/i;

/** « Pour la pâte : », « PÂTE SABLÉE », « Garniture : » */
function sectionTitle(line: string): string | null {
  if (line.length > 45 || /\d/.test(line)) return null;
  const pour = line.match(/^pour\s+(?:la|le|les|l['’]|un|une)?\s*(.+?)\s*:?\s*$/i);
  if (pour && pour[1].split(" ").length <= 5) return capitalize(pour[1]);
  if (/:\s*$/.test(line) && line.split(" ").length <= 5) return capitalize(line.replace(/\s*:\s*$/, ""));
  if (line === line.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(line) && line.split(" ").length <= 4) return capitalize(line.toLowerCase());
  return null;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const endsSentence = (text: string) => /[.!?)]\s*$/.test(text);

function looksLikeStep(line: string) {
  return numbered.test(line) || (verbs.test(line) && (line.length > 30 || endsSentence(line)));
}

function looksLikeIngredient(line: string) {
  if (line.length > 70 || looksLikeStep(line)) return false;
  return parseIngredientLine(line).quantity !== null;
}

// --- Découpage ------------------------------------------------------------------------------

export function parseRecipeText(text: string): ParsedRecipe {
  const result: ParsedRecipe = { name: "", portions: null, time: null, category: null, calories: null, protein: null, ingredients: [], steps: [] };
  let mode: "intro" | "ingredients" | "steps" = "intro";
  const times = { prep: 0, cook: 0, total: 0 };
  let currentStep: RecipeStep | null = null;
  let numberedSteps = false;

  const ingredientGroup = (title = "") => {
    const last = result.ingredients.at(-1);
    if (last && !last.items.length && (!last.title || !title)) {
      if (title) last.title = title;
      return last;
    }
    const group = { title, items: [] };
    result.ingredients.push(group);
    return group;
  };
  const stepGroup = (title = "") => {
    const last = result.steps.at(-1);
    if (last && !last.steps.length && (!last.title || !title)) {
      if (title) last.title = title;
      return last;
    }
    const group = { title, steps: [] as RecipeStep[] };
    result.steps.push(group);
    return group;
  };
  const currentIngredients = () => result.ingredients.at(-1) ?? ingredientGroup();
  const currentSteps = () => result.steps.at(-1) ?? stepGroup();

  /** Nouvelle étape, ou suite d'une étape coupée sur plusieurs lignes par la mise en page. */
  const addStep = (body: string, isNew: boolean) => {
    if (!isNew && currentStep) {
      currentStep.text = `${currentStep.text} ${body}`.trim();
      return;
    }
    // Étape numérotée courte sans point (« Étape 1 : La pâte ») : c'est un titre, le texte suit.
    // Mais « Mélanger la farine, ajouter » coupé par la mise en page reste une instruction.
    const short = numberedSteps && body.length <= 40 && !endsSentence(body) && !/[,;]$/.test(body) && !verbs.test(body);
    currentStep = short ? { title: body, text: "" } : { title: "", text: body };
    currentSteps().steps.push(currentStep);
  };

  const lines = text.split(/\r?\n/).map(cleanLine);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (!line || isNoise(line)) continue;

    // Pseudo collé devant la légende : « cuisine_de_lea Tarte au citron »
    if (!result.name && mode === "intro") line = line.replace(/^[a-z0-9]*[._][a-z0-9._]+\s+(?=\S)/, "");

    // Valeurs nutritionnelles : n'importe où, jamais un ingrédient.
    const kcal = line.match(kcalPattern);
    if (kcal && line.length < 90) {
      if (result.calories === null) result.calories = Math.round(Number(kcal[1].replace(",", ".")));
      const protein = line.match(proteinPattern);
      if (protein && result.protein === null) result.protein = Math.round(Number((protein[1] ?? protein[2]).replace(",", ".")));
      const portions = line.match(portionsPattern);
      if (portions && !result.portions) result.portions = Number(portions[1]);
      continue;
    }

    // Temps et portions : peuvent apparaître n'importe où.
    let matchedTime = false;
    for (const match of line.matchAll(timePattern)) {
      const minutes = /^h/i.test(match[3]) ? Number(match[2]) * 60 + Number(match[4] ?? 0) : Number(match[2]);
      const kind = match[1].toLowerCase();
      if (kind.startsWith("cuisson")) times.cook += minutes;
      else if (kind.startsWith("total") || kind.startsWith("temps")) times.total = minutes;
      else if (kind.startsWith("pr")) times.prep += minutes;
      matchedTime = true;
    }
    const portions = line.length < 40 ? line.match(portionsPattern) : null;
    if (portions && !result.portions) result.portions = Number(portions[1]);
    // Ligne entièrement consacrée au temps ou aux portions : rien d'autre à en tirer.
    const rest = line.replace(timePattern, "").replace(portionsPattern, "").replace(/[|/·,:()–-]/g, "").trim();
    if ((matchedTime || portions) && rest.length < 4) continue;

    const ingHeader = line.match(ingredientHeader);
    if (ingHeader && line.length < 50) {
      mode = "ingredients";
      const rest = ingHeader[1].replace(portionsPattern, "").replace(/^(pour|de|du)\s+(la|le|les|l['’])?\s*/i, "").replace(/[():]/g, "").trim();
      ingredientGroup(rest && !/\d/.test(rest) ? capitalize(rest) : "");
      continue;
    }
    const stHeader = line.match(stepsHeader);
    if (stHeader && line.length < 50 && (line.split(" ").length <= 5 || /:\s*$/.test(line))) {
      mode = "steps";
      currentStep = null;
      const rest = stHeader[1].replace(/^(de|du|des|pour)\s+(la|le|les|l['’])?\s*/i, "").replace(/[():]/g, "").trim();
      stepGroup(rest && !/\d/.test(rest) ? capitalize(rest) : "");
      continue;
    }

    const title = sectionTitle(line);
    if (title) {
      if (mode === "steps") { stepGroup(title); currentStep = null; }
      else { mode = "ingredients"; ingredientGroup(title); }
      continue;
    }

    if (mode === "intro") {
      if (looksLikeIngredient(line)) mode = "ingredients";
      else if (numbered.test(line)) mode = "steps";
      else {
        if (!result.name && line.length <= 80) result.name = line.replace(/[.!]+$/, "");
        continue;
      }
    }

    if (mode === "ingredients") {
      if (looksLikeStep(line) && !looksLikeIngredient(line)) {
        mode = "steps";
      } else {
        const group = currentIngredients();
        const previous = group.items.at(-1);
        const item = parseIngredientLine(line);
        // Ligne coupée par la mise en page : « 200 g de farine de » / « blé T55 »
        if (previous && item.quantity === null && /^[a-zà-ÿ]/.test(line) && !/[,.]$/.test(previous.name)) previous.name = `${previous.name} ${line}`;
        else group.items.push(item);
        continue;
      }
    }

    // mode étapes
    const number = line.match(numbered);
    if (number && number[2]) {
      numberedSteps = true;
      addStep(number[2], true);
    } else if (number) {
      numberedSteps = true;
      currentStep = { title: "", text: "" };
      currentSteps().steps.push(currentStep);
    } else if (numberedSteps && currentStep) {
      addStep(line, false);
    } else {
      // Étapes non numérotées : une phrase terminée clôt l'étape.
      addStep(line, !currentStep || endsSentence(currentStep.text));
    }
  }

  result.ingredients = result.ingredients.filter((group) => group.items.length);
  result.steps = result.steps
    .map((group) => ({ ...group, steps: group.steps.filter((step) => step.text || step.title).map((step) => (step.text ? step : { title: "", text: step.title })) }))
    .filter((group) => group.steps.length);
  result.time = times.total || times.prep + times.cook || null;
  result.category = guessCategory(result.name);
  return result;
}

export function summarize(parsed: ParsedRecipe) {
  const ingredients = parsed.ingredients.reduce((sum, group) => sum + group.items.length, 0);
  const steps = parsed.steps.reduce((sum, group) => sum + group.steps.length, 0);
  const parts = Math.max(parsed.ingredients.length, parsed.steps.length);
  return { ingredients, steps, parts };
}

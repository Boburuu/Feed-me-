// Lecture d'images dans le navigateur (version iPhone / Safari), là où Google ML Kit
// n'existe pas :
// - codes-barres : zxing-wasm (ZXing, le lecteur open source de référence) ;
// - texte : tesseract.js, avec le modèle de lecture du français.
// Les deux moteurs sont chargés depuis jsDelivr au premier usage seulement (environ
// 1 Mo pour ZXing, 4 Mo pour Tesseract), puis gardés en cache par le navigateur.

import type { Worker } from "tesseract.js";

/** Code-barres d'un produit (EAN, UPC) sur une photo ; null si aucun n'est lisible. */
export async function readBarcodeFromFile(file: Blob): Promise<string | null> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  const results = await readBarcodes(file, { formats: ["EAN13", "EAN8", "UPCA", "UPCE"], tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 });
  return results.find((result) => result.isValid && result.text)?.text ?? null;
}

let worker: Promise<Worker> | null = null;

/** Un seul lecteur Tesseract pour toute la session : le charger prend quelques secondes. */
function ocrWorker() {
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker("fra"));
  worker.catch(() => { worker = null; });
  return worker;
}

/** Texte d'une capture d'écran : une ligne par ligne lue, un saut de ligne entre les paragraphes. */
export async function readTextFromFile(file: Blob): Promise<string> {
  const { data } = await (await ocrWorker()).recognize(file);
  return data.text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Lignes lues avec leur hauteur : sur un emballage, le nom du produit est écrit en gros. */
export async function readLinesFromFile(file: Blob) {
  const { data } = await (await ocrWorker()).recognize(file, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({
    text: line.text.trim(),
    height: line.bbox.y1 - line.bbox.y0,
  }));
}

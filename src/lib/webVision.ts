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

/** Lignes lues avec leur position (tableau nutritionnel : les colonnes comptent). */
export async function readBoxesFromFile(file: Blob) {
  const { data } = await (await ocrWorker()).recognize(file, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({
    text: line.text.trim(),
    x: line.bbox.x0,
    y: line.bbox.y0,
    w: line.bbox.x1 - line.bbox.x0,
    h: line.bbox.y1 - line.bbox.y0,
  }));
}

/**
 * Photo préparée pour la lecture d'un emballage : réduite (une photo d'iPhone fait 4 000 px,
 * trop lent et pas plus lisible), en niveaux de gris, contraste étiré.
 */
async function packagingImage(file: Blob): Promise<Blob> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  let low = 255, high = 0;
  for (let i = 0; i < data.length; i += 4) {
    const grey = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = grey;
    if (grey < low) low = grey;
    if (grey > high) high = grey;
  }
  const range = Math.max(1, high - low);
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = Math.round(((data[i] - low) / range) * 255);
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png"));
}

/** Lignes lues avec leur hauteur : sur un emballage, le nom du produit est écrit en gros. */
export async function readLinesFromFile(file: Blob) {
  const reader = await ocrWorker();
  // Texte épars (marque, nom, mentions) plutôt qu'une page de livre.
  await reader.setParameters({ tessedit_pageseg_mode: "11" as never });
  const { data } = await reader.recognize(await packagingImage(file).catch(() => file), {}, { blocks: true }).finally(() => reader.setParameters({ tessedit_pageseg_mode: "3" as never }));
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({
    text: line.text.trim(),
    height: line.bbox.y1 - line.bbox.y0,
  }));
}

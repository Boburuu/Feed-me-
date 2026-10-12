// Lecture du texte d'une capture d'écran, sur le téléphone et hors ligne (Google ML Kit).
// ML Kit n'existe pas dans un navigateur : sur ordinateur, on colle le texte à la place.

import { Capacitor } from "@capacitor/core";

export const ocrAvailable = () => Capacitor.isNativePlatform();

const MAX_SIDE = 2400;
const MAX_BYTES = 20 * 1024 * 1024;

/** Réduit l'image si besoin et la rend en JPEG base64 (sans l'en-tête data:). */
function toJpegBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible")); };
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Canvas indisponible"));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
    };
    image.src = url;
  });
}

/** Lit une capture : un bloc de texte par paragraphe, une ligne par ligne lue. */
export async function readImageText(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Ce fichier n'est pas une image.");
  if (file.size > MAX_BYTES) throw new Error("Image trop lourde (20 Mo maximum).");
  // Chargés à la première capture seulement : le moteur est lourd.
  const [{ Directory, Filesystem }, { TextRecognition }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor-mlkit/text-recognition"),
  ]);
  const path = `ocr-${Date.now()}.jpg`;
  const { uri } = await Filesystem.writeFile({ path, data: await toJpegBase64(file), directory: Directory.Cache });
  try {
    const result = await TextRecognition.processImage({ path: uri });
    return result.blocks.map((block) => block.lines.map((line) => line.text).join("\n")).join("\n\n");
  } finally {
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

/**
 * Lignes de texte d'une image déjà écrite dans le cache, avec leur hauteur à l'écran :
 * sur un emballage, le nom du produit est écrit en plus gros que le reste.
 */
export async function readTextLines(uri: string) {
  const { TextRecognition } = await import("@capacitor-mlkit/text-recognition");
  const result = await TextRecognition.processImage({ path: uri });
  return result.blocks.flatMap((block) => block.lines).map((line) => ({
    text: line.text,
    height: line.boundingBox ? line.boundingBox.bottom - line.boundingBox.top : 0,
  }));
}

const key = (line: string) => line.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Assemble plusieurs captures d'une même recette. Quand on fait défiler la légende,
 * le bas d'une capture se retrouve en haut de la suivante : on retire ce chevauchement.
 */
export function mergeTexts(texts: string[]) {
  let lines: string[] = [];
  for (const text of texts) {
    const next = text.split("\n").filter((line) => key(line));
    // La capture suivante commence souvent par la barre d'état et le pseudo :
    // on cherche, dans ses premières lignes, une suite identique à la fin du texte déjà lu.
    let drop = 0;
    for (let start = 0; start < Math.min(15, next.length) && !drop; start += 1) {
      for (let size = Math.min(lines.length, next.length - start); size >= 2; size -= 1) {
        const tail = lines.slice(-size).map(key).join("\n");
        const head = next.slice(start, start + size).map(key).join("\n");
        if (tail === head) { drop = start + size; break; }
      }
    }
    lines = [...lines, ...next.slice(drop)];
  }
  return lines.join("\n").trim();
}

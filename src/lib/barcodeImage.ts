// Code-barres d'un produit lu sur une photo déjà prise (galerie), ou saisi à la main.
//
// Seuls les codes-barres de produits (EAN-13, EAN-8, UPC) comptent : un QR code n'identifie
// pas un produit alimentaire. Sur Android, Google ML Kit lit la photo ; sinon (ou s'il ne
// trouve rien), ZXing prend le relais, y compris sur une zone recadrée par l'utilisateur.

import { Capacitor } from "@capacitor/core";

/** Chiffre de contrôle GS1 : un code mal recopié est refusé avant toute recherche. */
export function isValidProductCode(code: string) {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Chiffres tapés (espaces et tirets acceptés) → code, ou null s'il est invalide. */
export function cleanProductCode(text: string) {
  const code = text.replace(/[\s-]/g, "");
  return isValidProductCode(code) ? code : null;
}

async function mlKitCodes(file: Blob): Promise<string[]> {
  const [{ Directory, Filesystem }, { BarcodeScanner }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor-mlkit/barcode-scanning")]);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const path = `code-${Date.now()}.jpg`;
  const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
  try {
    const { barcodes } = await BarcodeScanner.readBarcodesFromImage({ path: uri, formats: ["EAN_13", "EAN_8", "UPC_A", "UPC_E"] as never });
    return barcodes.map((barcode) => barcode.rawValue ?? "").filter(Boolean);
  } finally {
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

async function zxingCodes(file: Blob): Promise<string[]> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  const results = await readBarcodes(file, { formats: ["EAN13", "EAN8", "UPCA", "UPCE"], tryHarder: true, tryRotate: true, tryDownscale: true, maxNumberOfSymbols: 4 });
  return results.filter((result) => result.isValid).map((result) => result.text);
}

/** Codes-barres de produits trouvés sur l'image (sans doublon, codes valides seulement). */
export async function readProductCodes(file: Blob): Promise<string[]> {
  let codes: string[] = [];
  if (Capacitor.isNativePlatform()) codes = await mlKitCodes(file).catch(() => []);
  if (!codes.length) codes = await zxingCodes(file).catch(() => []);
  return [...new Set(codes)].filter(isValidProductCode);
}

export type CropRect = { x: number; y: number; width: number; height: number };

/** Zone choisie de la photo (coordonnées en fractions de l'image), agrandie pour la lecture. */
export async function cropImage(file: Blob, rect: CropRect): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = url;
    });
    const sx = rect.x * image.width;
    const sy = rect.y * image.height;
    const sw = Math.max(1, rect.width * image.width);
    const sh = Math.max(1, rect.height * image.height);
    // Une petite zone est agrandie : ZXing lit mieux des barres larges.
    const scale = Math.min(4, Math.max(1, 1200 / Math.max(sw, sh)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")!.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Recadrage impossible"))), "image/jpeg", 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

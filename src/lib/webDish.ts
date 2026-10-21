// Reconnaissance de plats dans le navigateur (version iPhone) : le même modèle que sur
// Android (« AIY Vision Classifier Food V1 », Google, Apache 2.0, ~2 000 plats), exécuté par
// MediaPipe. Le modèle (21 Mo) n'est pas dans l'app Android : il est publié avec la version
// web (dossier food/) et téléchargé à la première photo, puis gardé en cache par le navigateur.

import type { ImageClassifier } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL = new URL("food/aiy_food_v1.tflite", document.baseURI).href;

let classifier: Promise<ImageClassifier> | null = null;

/** Un seul modèle pour toute la session ; en cas d'échec (hors connexion), on réessaiera. */
function load() {
  classifier ??= (async () => {
    const { FilesetResolver, ImageClassifier } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM);
    return ImageClassifier.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, maxResults: 10, runningMode: "IMAGE" });
  })();
  classifier.catch(() => { classifier = null; });
  return classifier;
}

/** Plats probables sur la photo, du plus probable au moins probable (noms anglais du modèle). */
export async function classifyDishInBrowser(file: Blob): Promise<{ label: string; score: number }[]> {
  const image = await createImageBitmap(file);
  // Carré au centre, comme sur Android : l'assiette est en général au milieu de la photo.
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(side, 512);
  canvas.getContext("2d")!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  image.close();
  const result = (await load()).classify(canvas);
  return (result.classifications[0]?.categories ?? [])
    // displayName : le nom du plat (« Hamburger ») ; categoryName : un identifiant (« /m/0cdn1 »).
    .map((category) => ({ label: category.displayName || category.categoryName, score: category.score }))
    .filter((item) => item.label && item.label !== "__background__" && !item.label.startsWith("/"));
}

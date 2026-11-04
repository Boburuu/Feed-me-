// Clavier du téléphone ouvert : la zone visible rétrécit et un champ de saisie est actif. La classe
// sur <html> sert à masquer les barres du bas, qui sinon se posent sur le clavier et cachent les
// résultats. Sans champ actif, jamais de masquage (fenêtre redimensionnée, écran partagé).

const KEYBOARD_MIN_PX = 150;

const typing = () => {
  const element = document.activeElement;
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && !["checkbox", "radio", "date", "file", "button"].includes(element.type);
};

export function watchKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  let full = viewport.height;
  let width = viewport.width;
  const update = () => {
    // Téléphone tourné : on repart de la nouvelle hauteur.
    if (viewport.width !== width) { width = viewport.width; full = viewport.height; }
    // Sans champ actif, la hauteur vue est la hauteur pleine (y compris si elle a rétréci).
    if (!typing()) full = viewport.height;
    full = Math.max(full, viewport.height);
    document.documentElement.classList.toggle("keyboard-open", typing() && full - viewport.height > KEYBOARD_MIN_PX);
  };
  viewport.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  // Après le changement de focus (focusout arrive avant que le nouveau champ soit actif).
  document.addEventListener("focusout", () => window.setTimeout(update, 0));
}

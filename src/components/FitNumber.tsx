import { useLayoutEffect, useRef } from "react";

/** Rayon intérieur de l'anneau (cercle de 43 et trait de 9 sur un dessin de 100), en part de son rayon. */
const INNER_RADIUS = 38.5 / 50;
/** Espace gardé entre le texte et l'anneau, en pixels. */
const GAP = 3;

/** Rectangles réels du texte, ligne par ligne (pas ceux de sa boîte, plus large). */
function textRects(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()];
}

/** Chiffre et libellé au centre d'un anneau : réduits jusqu'à tenir dans le rond, quelle que soit la taille du texte du téléphone. */
export default function FitNumber({ children }: { children: React.ReactNode }) {
  const number = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = number.current;
    const ring = element?.closest<HTMLElement>(".kr");
    const label = element?.parentElement?.querySelector("small");
    if (!element || !ring || !label) return;
    const fits = () => {
      const box = ring.getBoundingClientRect();
      const radius = box.width / 2;
      return [...textRects(element), ...textRects(label)].every((text) =>
        [[text.left, text.top], [text.right, text.top], [text.left, text.bottom], [text.right, text.bottom]]
          .every(([x, y]) => Math.hypot(x - box.left - radius, y - box.top - radius) <= radius * INNER_RADIUS - GAP));
    };
    const fit = () => {
      element.style.fontSize = "";
      label.style.fontSize = "";
      let numberSize = parseFloat(getComputedStyle(element).fontSize);
      let labelSize = parseFloat(getComputedStyle(label).fontSize);
      // Le téléphone peut agrandir le texte après coup : on mesure le résultat réel à chaque essai.
      for (let pass = 0; pass < 20 && !fits(); pass += 1) {
        numberSize *= 0.94;
        labelSize *= 0.97;
        element.style.fontSize = `${numberSize}px`;
        label.style.fontSize = `${labelSize}px`;
      }
    };
    fit();
    // La police arrive parfois après le premier affichage, et l'anneau suit la largeur de l'écran.
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(ring);
    return () => observer.disconnect();
  }, [children]);

  return <strong ref={number}>{children}</strong>;
}

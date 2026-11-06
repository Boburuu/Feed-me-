import { useLayoutEffect, useRef } from "react";

/** Rayon intérieur de l'anneau (cercle de 43 et trait de 9 sur un dessin de 100), en part de son rayon. */
const INNER_RADIUS = 38.5 / 50;

/** Chiffre au centre d'un anneau : réduit jusqu'à tenir dans le rond, quelle que soit la taille du texte du téléphone. */
export default function FitNumber({ children }: { children: React.ReactNode }) {
  const number = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = number.current;
    const ring = element?.closest<HTMLElement>(".kr");
    if (!element || !ring) return;
    const fits = () => {
      const box = ring.getBoundingClientRect();
      const radius = box.width / 2;
      const text = element.getBoundingClientRect();
      const corners = [[text.left, text.top], [text.right, text.top], [text.left, text.bottom], [text.right, text.bottom]];
      return corners.every(([x, y]) => Math.hypot(x - box.left - radius, y - box.top - radius) <= radius * INNER_RADIUS - 1);
    };
    const fit = () => {
      element.style.fontSize = "";
      let size = parseFloat(getComputedStyle(element).fontSize);
      // Le téléphone peut agrandir le texte après coup : on mesure le résultat réel à chaque essai.
      for (let pass = 0; pass < 14 && !fits(); pass += 1) {
        size *= 0.92;
        element.style.fontSize = `${size}px`;
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

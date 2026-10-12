import { useImage } from "../lib/images";

/** Image rangée dans IndexedDB, avec un indicateur de chargement. */
export default function StoredImage({ id, alt }: { id: string; alt: string }) {
  const src = useImage(id);
  return src ? <img src={src} alt={alt} /> : <span className="loader" />;
}

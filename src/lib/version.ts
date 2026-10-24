// Version de l'app, affichée discrètement en bas du profil (utile pour savoir si le téléphone est à jour).

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** « Feed Me v1.5 · mise à jour du 24 octobre 2026 (e7101d9) ». */
export function versionLabel(version = typeof __APP_VERSION__ === "undefined" ? null : __APP_VERSION__) {
  if (!version) return "Feed Me";
  const name = version.tag ? `Feed Me ${version.tag}` : "Feed Me";
  const extra = version.after > 0 ? ` · mise à jour du ${day(version.date)}` : version.tag ? "" : ` · ${day(version.date)}`;
  return `${name}${extra}${version.hash ? ` (${version.hash})` : ""}`;
}

/** Version courte, visible sur tous les écrans : « v1.5 · màj 24/10 ». */
export function shortVersion(version = typeof __APP_VERSION__ === "undefined" ? null : __APP_VERSION__) {
  if (!version) return "";
  const date = new Date(`${version.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return [version.tag, version.after > 0 || !version.tag ? `màj ${date}` : ""].filter(Boolean).join(" · ");
}

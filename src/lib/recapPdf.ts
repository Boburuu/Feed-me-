// Mise en page du récapitulatif en PDF (A4), puis partage (téléphone) ou téléchargement.
// jsPDF n'est chargé qu'au moment de créer le fichier.

import { Capacitor } from "@capacitor/core";
import type { Recap, RecapSections } from "./recap";

const GREEN: [number, number, number] = [31, 138, 76];
const GREY: [number, number, number] = [110, 110, 110];

/** Police standard du PDF : pas de « ≈ », « → », espaces fines ni émojis. */
export const pdfText = (text: string) =>
  text
    .replace(/[  ]/g, " ")
    .replace(/≈/g, "~")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\u0000-ÿŒœ€]/g, "");

const n = (value: number | null | undefined, unit = "") => (value === null || value === undefined ? "-" : `${value.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`);
const water = (ml: number | null) => (ml === null ? "-" : ml >= 1000 ? `${(Math.round(ml / 100) / 10).toLocaleString("fr-FR")} L` : `${ml} ml`);
const longDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export const recapFileName = (recap: Recap) => `feedme-recap-${recap.from}${recap.to !== recap.from ? `_${recap.to}` : ""}.pdf`;

/** Crée le PDF (en mémoire). */
export async function recapPdf(recap: Recap, sections: RecapSections, person: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14;
  let y = 18;
  const text = (value: string, size = 10, color: [number, number, number] = [20, 20, 20], bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(value), 182) as string[];
    if (y + lines.length * size * 0.45 > 285) { doc.addPage(); y = 18; }
    doc.text(lines, left, y);
    y += lines.length * size * 0.45 + 2;
  };
  const table = (head: string[], body: string[][], widths?: number[]) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(pdfText)],
      body: body.map((row) => row.map(pdfText)),
      margin: { left, right: 14 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6, overflow: "linebreak" },
      headStyles: { fillColor: GREEN, textColor: 255 },
      ...(widths ? { columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])) } : {}),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  text("Feed Me - Récapitulatif", 18, GREEN, true);
  text(`${person ? `${person} · ` : ""}du ${shortDay(recap.from)} au ${shortDay(recap.to)}`, 11, GREY);
  y += 2;

  const s = recap.summary;
  if (sections.summary) {
    text("Résumé de la période", 13, [20, 20, 20], true);
    const rows: string[][] = [["Jours notés", `${s.daysLogged} sur ${s.days}${s.freeDays ? ` (+ ${s.freeDays} jour${s.freeDays > 1 ? "s" : ""} libre${s.freeDays > 1 ? "s" : ""}, hors moyennes)` : ""}`]];
    if (sections.meals || sections.nutrients) rows.push(["Calories / jour (moyenne)", n(s.kcal, "kcal")]);
    if (sections.nutrients) rows.push(["Protéines / glucides / lipides (moyenne)", `${n(s.protein, "g")} / ${n(s.carbs, "g")} / ${n(s.fat, "g")}`]);
    if (sections.water) rows.push(["Hydratation / jour (moyenne)", water(s.waterMl)]);
    if (sections.activity) rows.push(["Pas / jour (moyenne)", n(s.steps)], ["Sport", s.sessions ? `${s.sessions} séance${s.sessions > 1 ? "s" : ""} · ${s.sessionMinutes} min` : "-"]);
    if (sections.weight) rows.push(["Poids", s.weightFirst === null ? "-" : s.weightFirst === s.weightLast ? n(s.weightFirst, "kg") : `${n(s.weightFirst, "kg")} -> ${n(s.weightLast, "kg")} (${s.weightLast! - s.weightFirst > 0 ? "+" : ""}${n(Math.round((s.weightLast! - s.weightFirst) * 10) / 10, "kg")})`]);
    table(["", "Valeur"], rows, [90, 92]);
  }

  if (!recap.days.length) text("Rien de noté sur cette période.", 11, GREY);
  for (const day of recap.days) {
    if (y > 250) { doc.addPage(); y = 18; }
    text(`${longDay(day.date)}${day.free ? " · journée libre" : ""}`, 12, GREEN, true);
    if (sections.meals && day.meals.length) {
      const head = sections.nutrients ? ["Moment", "Repas", "kcal", "Prot.", "Gluc.", "Lip."] : ["Moment", "Repas", "kcal"];
      const body = day.meals.map((meal) => {
        const kcal = meal.free ? (meal.estimate ? `~${meal.estimate} (libre)` : "libre") : String(meal.kcal);
        const row = [meal.category, meal.name, kcal];
        return sections.nutrients ? [...row, meal.free ? "-" : n(meal.protein, "g"), meal.free ? "-" : n(meal.carbs, "g"), meal.free ? "-" : n(meal.fat, "g")] : row;
      });
      const total = ["", day.free ? "Total (hors repas libre)" : "Total", String(day.totals.kcal)];
      body.push(sections.nutrients ? [...total, `${day.totals.protein} g`, `${day.totals.carbs} g`, `${day.totals.fat} g`] : total);
      table(head, body, sections.nutrients ? [26, 86, 22, 16, 16, 16] : [30, 120, 32]);
    }
    const facts: string[] = [];
    if (sections.water && day.waterMl) facts.push(`Eau : ${water(day.waterMl)}`);
    if (sections.activity && day.steps) facts.push(`Pas : ${n(day.steps)}`);
    if (sections.activity) day.sessions.forEach((session) => facts.push(`${session.label} : ${session.minutes} min`));
    if (sections.weight && day.weight !== null) facts.push(`Poids : ${n(day.weight, "kg")}`);
    if (sections.fasting) day.fastHours.forEach((hours) => facts.push(`Jeûne : ${n(hours, "h")}`));
    if (facts.length) text(facts.join("   ·   "), 10, GREY);
    y += 2;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(pdfText(`Feed Me · créé le ${shortDay(new Date().toISOString().slice(0, 10))} · page ${page}/${pages}`), left, 292);
  }
  return doc;
}

export type SavedRecap = { fileName: string; place: string; uri?: string };

/**
 * Téléphone : PDF enregistré dans « Téléchargements » (sinon dans l'app), à partager ensuite ;
 * navigateur : téléchargement direct.
 */
export async function saveRecapPdf(recap: Recap, sections: RecapSections, person: string): Promise<SavedRecap> {
  const doc = await recapPdf(recap, sections, person);
  const fileName = recapFileName(recap);
  if (!Capacitor.isNativePlatform()) {
    doc.save(fileName);
    return { fileName, place: "Téléchargements" };
  }
  const { Directory, Filesystem } = await import("@capacitor/filesystem");
  const data = (doc.output("datauristring") as string).split(",")[1];
  try {
    const file = await Filesystem.writeFile({ path: `Download/${fileName}`, data, directory: Directory.ExternalStorage, recursive: true });
    return { fileName, place: "Téléchargements", uri: file.uri };
  } catch {
    // Dossier public refusé : le fichier reste dans l'app, à partager.
    const file = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    return { fileName, place: "l'app (à partager)", uri: file.uri };
  }
}

/** Ouvre la feuille de partage du téléphone (mail, WhatsApp, Drive…) pour un PDF enregistré. */
export async function shareSavedRecap(saved: SavedRecap) {
  if (!saved.uri) return;
  const { Share } = await import("@capacitor/share");
  await Share.share({ title: "Récapitulatif Feed Me", files: [saved.uri] });
}

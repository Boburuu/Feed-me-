// Texte de la version publiée sur GitHub : les nouveautés en lignes « - », que l'app affiche
// dans sa fenêtre de mise à jour, puis la marche à suivre pour l'installer.
import { readFileSync, writeFileSync } from "node:fs";

const [tag, output] = process.argv.slice(2);
const notes = JSON.parse(readFileSync("src/data/changelog.json", "utf8"))[tag] ?? [];
writeFileSync(output, `${notes.map((note) => `- ${note}`).join("\n")}

**Installer sur Android** : téléchargez \`feed-me.apk\` ci-dessous depuis le téléphone, ouvrez-le, puis autorisez « Installer des applis inconnues » si Android le demande.
Une nouvelle version s'installe par-dessus l'ancienne sans perdre les données.
`);

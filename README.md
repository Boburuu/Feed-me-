# Feed Me

Application de suivi nutrition, hydratation, activité et poids (voir [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md)).

- Aucun serveur : toutes les données restent sur l'appareil (`localStorage`, clé `feedme:data`). Les images des recettes sont dans IndexedDB (`feedme-images`) et sont incluses dans la sauvegarde.
- Besoins caloriques : équations de Henry (2005) et niveaux d'activité de l'EFSA, déficit plafonné selon la HAS, puis correction avec les repas et pesées réels (voir `src/lib/nutrition.ts`).
- Au premier lancement : profil (prénom, nom, pseudo, photo, âge, taille, poids, activité) puis création d'un code à 4 chiffres (les codes à 6 chiffres créés avant restent valables).
- Le code est demandé à chaque ouverture, et après 1 minute en arrière-plan.
- Sauvegarde : Profil → Mes données → Exporter / Importer (fichier JSON).

> Le code PIN protège l'accès à l'écran, il ne chiffre pas les données. Un code oublié ne peut pas être récupéré : il faut tout effacer puis réimporter une sauvegarde.

## Installer l'application

### Android
1. Sur le téléphone, ouvrir la page **Releases** de ce dépôt (colonne de droite sur GitHub) et télécharger `feed-me.apk` de la dernière version.
2. Ouvrir le fichier téléchargé. Si Android le demande, autoriser « Installer des applis inconnues » pour le navigateur.
3. Pour mettre à jour : télécharger la nouvelle version et l'installer par-dessus. Les données sont conservées.

### iPhone (version web)
Pas de version App Store : l'app s'utilise depuis Safari.
1. Ouvrir l'adresse GitHub Pages du dépôt dans **Safari** (`https://<compte>.github.io/<dépôt>/`).
2. Bouton **Partager** → **Sur l'écran d'accueil**. L'app s'ouvre ensuite en plein écran, comme une vraie app.

Disponible sur iPhone : journal, recherche d'aliments (Ciqual et Open Food Facts), boissons, assiettes maison, restes, recettes, suivi, poids, objectifs. Réservé à Android : podomètre automatique, photo du repas, scan de code-barres, lecture des captures de recettes (sur iPhone, coller le texte de la recette).

Les données restent dans le navigateur du téléphone : ne pas effacer les données de Safari, et exporter une sauvegarde régulièrement.

## Publier une nouvelle version

Tout passe par GitHub Actions (onglet **Actions** du dépôt) :

- **Version web** (`.github/workflows/web.yml`) : republiée automatiquement à chaque `git push` sur `master`.
- **Version Android** (`.github/workflows/android-release.yml`) : fabriquée et publiée dans les Releases quand on pousse un tag :
  ```bash
  git tag v1.1
  git push origin v1.1
  ```

### Configuration du dépôt (une seule fois)

1. **Pages** : Settings → Pages → Source : **GitHub Actions**.
2. **Secrets** : Settings → Secrets and variables → Actions → New repository secret :
   - `FEEDME_KEYSTORE_BASE64` : le contenu du fichier `~/.feedme-signing/feedme-release.jks.base64.txt` ;
   - `FEEDME_KEYSTORE_PASSWORD` : la valeur `storePassword` de `~/.feedme-signing/keystore.properties`.

La clé de signature (`~/.feedme-signing/`) n'est jamais dans le dépôt. **La sauvegarder** (clé USB, gestionnaire de mots de passe) : sans elle, une nouvelle version ne peut plus s'installer par-dessus l'ancienne, et tous les utilisateurs devraient désinstaller (et perdre leurs données).

## Développement

Prérequis : [Node.js](https://nodejs.org) 20 ou plus. Pour Android : Android Studio (son Java 21 sert à compiler).

```bash
npm install
```

## Dans le navigateur

| Commande | Usage |
| --- | --- |
| `npm run dev` | Développement sur http://localhost:5173, rechargement automatique. Le terminal doit rester ouvert. |
| `npm run build` | Produit `dist/index.html`, un fichier unique à ouvrir directement dans Chrome. |

Le `index.html` à la racine est la source utilisée par Vite : l'ouvrir directement affiche une page blanche.

## Sur Android (Capacitor)

Identifiant de l'application : `app.feedme.duo` (ne jamais le changer, sinon le téléphone voit une autre app et les données ne suivent pas).

| Commande | Usage |
| --- | --- |
| `npm run android:sync` | Reconstruit le site et le copie dans le projet `android/`. À lancer après chaque modification. |
| `npm run android:open` | Idem, puis ouvre Android Studio (bouton ▶ pour installer sur le téléphone). |
| `npm run android:run` | Idem, puis installe directement sur le téléphone branché en USB. |

Sur le téléphone : Paramètres → À propos → toucher 7 fois « Numéro de build » pour activer les Options de développement, puis activer le Débogage USB.

Ces commandes installent la **version de test** (débogable, signée avec la clé de test du PC). Elle ne peut pas être mise à jour par la version finale des Releases, et inversement : pour passer de l'une à l'autre, exporter une sauvegarde, désinstaller, installer l'autre, puis importer la sauvegarde.

Version finale sur le PC (signée avec `~/.feedme-signing`) : `cd android && ./gradlew assembleRelease`, fichier dans `android/app/build/outputs/apk/release/`.

Déboguer la version de test sur le téléphone : ouvrir `chrome://inspect` dans Chrome sur le PC.

### Icône et écran de démarrage

Les images sources sont dans `assets/`. Après modification :

```bash
npx @capacitor/assets generate --android
```

### Désinstallation

Désinstaller l'application efface ses données : exporter une sauvegarde avant.

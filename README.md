# Feed Me

Une application gratuite pour suivre ce que l'on mange, ce que l'on boit, ses pas et son poids.

Elle s'installe en 5 minutes. Suivez les étapes une par une, sans vous presser.

---

## 📱 Étape 0 : quel téléphone avez-vous ?

Regardez le dos du téléphone :

- **Il y a une pomme croquée** → c'est un **iPhone**. Allez à la partie [iPhone](#-iphone).
- **Il n'y a pas de pomme** (Samsung, Xiaomi, Oppo, Google Pixel…) → c'est un **Android**. Allez à la partie [Android](#-android-samsung-xiaomi).

---

## 🤖 Android (Samsung, Xiaomi…)

Il faut Internet, de préférence le wifi : le fichier est un peu gros.

1. **Sur le téléphone**, touchez ce lien :

   ### 👉 [Télécharger Feed Me pour Android](https://github.com/Boburuu/Feed-me-/releases/latest/download/feed-me.apk)

2. Un message comme « Ce fichier peut être dangereux » peut apparaître. Touchez **Télécharger quand même**.
   C'est normal : l'application ne vient pas du Play Store, elle vient d'une amie.
3. Attendez la fin du téléchargement (environ 1 minute), puis touchez **Ouvrir** en bas de l'écran.
   *Le message a disparu ?* Tirez le haut de l'écran vers le bas avec le doigt, puis touchez **feed-me.apk**.
4. Le message « L'installation d'applications inconnues est bloquée » peut apparaître. Touchez **Paramètres**, activez l'interrupteur **Autoriser**, puis revenez en arrière avec la flèche.
5. Touchez **Installer**.
6. Un message **Play Protect** peut apparaître. Touchez **Plus de détails**, puis **Installer quand même**.
7. Touchez **Ouvrir**. **C'est fini !** 🎉

L'icône **Feed Me** est maintenant avec vos autres applications.

---

## 🍎 iPhone

Sur iPhone, on n'installe rien : on ajoute Feed Me sur l'écran, et elle s'ouvre comme une vraie application.

⚠️ Il faut utiliser **Safari**, l'application avec la boussole bleue.

1. **Sur l'iPhone, dans Safari**, ouvrez ce lien :

   ### 👉 [Ouvrir Feed Me pour iPhone](https://boburuu.github.io/Feed-me-/)

   Pour l'écrire à la main, tapez dans la barre d'adresse : **boburuu.github.io/Feed-me-**
2. Touchez le bouton **Partager**. C'est un carré avec une flèche vers le haut ⬆️, en bas de l'écran, au milieu.
3. Descendez un peu dans la liste, puis touchez **Sur l'écran d'accueil** ➕.
4. Touchez **Ajouter**, en haut à droite.
5. **C'est fini !** 🎉 L'icône **Feed Me** est sur l'écran, avec vos autres applications.

Sur iPhone, ces trois options ne sont pas disponibles :

- le compteur de pas automatique ;
- la photo du repas ;
- le scan de code-barres.

Tout le reste fonctionne.

---

## 👋 La première fois

1. Ouvrez Feed Me.
2. Remplissez votre profil : prénom, âge, taille, poids. Ces informations servent à calculer ce dont votre corps a besoin chaque jour.
3. Choisissez un **code secret de 4 chiffres**.

   ✏️ **Notez-le sur un papier** : un code oublié ne peut pas être retrouvé.

🔒 Vos informations restent **uniquement dans votre téléphone**. Personne d'autre ne les voit.

---

## 🆘 En cas de souci

| Ce qui se passe | Ce qu'il faut faire |
| --- | --- |
| **Android** : je ne trouve pas le fichier téléchargé | Ouvrez l'application **Mes fichiers**, puis **Téléchargements**, et touchez **feed-me.apk**. |
| **Android** : « Application non installée » | Une ancienne version de Feed Me est déjà installée. Appuyez longtemps sur son icône et touchez **Désinstaller**. Ensuite, recommencez au début. |
| **iPhone** : je ne vois pas « Sur l'écran d'accueil » | Vérifiez que vous êtes bien dans **Safari**, et pas dans Chrome ou Google. |
| **Android** : une nouvelle version est annoncée | Refaites les étapes Android. La nouvelle version remplace l'ancienne et **vos données sont gardées**. |
| **iPhone** : une nouvelle version est annoncée | Rien à faire : fermez Feed Me, puis rouvrez-la. |

⚠️ **Sur iPhone**, n'effacez pas « l'historique et les données de sites » de Safari dans les Réglages. Cela efface aussi Feed Me.

💾 **Conseil :** de temps en temps, faites une sauvegarde. Touchez votre photo en haut, puis **Mes données**, puis **Exporter**.

---
---

# Pour les développeurs

Application de suivi nutrition, hydratation, activité et poids (voir [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md)).

- **Aucun serveur.** Toutes les données restent sur l'appareil :
  - les données dans `localStorage`, clé `feedme:data` ;
  - les images des recettes dans IndexedDB (`feedme-images`), incluses dans la sauvegarde.
- **Besoins caloriques.** Ils sont calculés en trois temps (voir `src/lib/nutrition.ts`) :
  - équations de Henry (2005) et niveaux d'activité de l'EFSA ;
  - déficit plafonné selon la HAS ;
  - correction d'après les repas et les pesées réels.
- **Premier lancement.** L'app demande le profil (prénom, nom, pseudo, photo, âge, taille, poids, activité), puis un code à 4 chiffres. Les codes à 6 chiffres créés avant restent valables.
- **Code.** Il est demandé à chaque ouverture, et après 1 minute en arrière-plan.
- **Sauvegarde.** Profil → Mes données → Exporter / Importer (fichier JSON).

> Le code PIN protège l'accès à l'écran, il ne chiffre pas les données. Un code oublié ne peut pas être récupéré : il faut tout effacer, puis réimporter une sauvegarde.

Sur iPhone, la lecture des captures de recettes n'est pas disponible : il faut coller le texte de la recette.

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

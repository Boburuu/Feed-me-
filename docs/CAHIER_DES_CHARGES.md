# Cahier des charges — Application de suivi nutritionnel et sportif

## 1. Présentation du projet

### 1.1 Nom de travail

**Nutri — compagnon quotidien nutrition, hydratation et activité**

### 1.2 Contexte

L’application aide une personne à estimer son besoin énergétique journalier puis à suivre, dans une interface unique, ses repas, ses calories, son hydratation et son activité physique. Elle ajoute une dimension de motivation grâce à des objectifs sportifs cochables et à un carnet de recettes.

Le produit est pensé en priorité pour une utilisation mobile quotidienne, avec une consultation rapide en quelques secondes.

### 1.3 Objectif principal

Permettre à l’utilisateur de comprendre simplement son équilibre quotidien entre :

- les calories recommandées ;
- les calories consommées ;
- les calories dépensées par l’activité ;
- l’hydratation ;
- les habitudes sportives ;
- la composition nutritionnelle de ses recettes.

### 1.4 Objectifs secondaires

- Réduire la saisie manuelle grâce aux estimations automatiques.
- Encourager la régularité plutôt que la performance ponctuelle.
- Présenter les informations sans jugement ni vocabulaire culpabilisant.
- Rendre l’application personnalisable grâce à plusieurs thèmes.
- Permettre une évolution future vers une analyse nutritionnelle connectée.

### 1.5 Public cible

- Adultes souhaitant mieux suivre leur alimentation.
- Personnes reprenant une activité sportive.
- Utilisateurs suivant un objectif de maintien, perte ou prise de poids.
- Personnes recherchant un journal simple sans complexité médicale.

L’application ne se substitue pas à un médecin, un diététicien ou un nutritionniste.

---

## 2. Périmètre fonctionnel

### 2.1 Tableau de bord

Le tableau de bord constitue l’écran d’accueil. Il présente :

- la date du jour ;
- le prénom de l’utilisateur ;
- son objectif calorique ;
- les calories déjà consommées ;
- les calories restantes ;
- un anneau de progression ;
- le nombre de pas ;
- les calories d’activité ;
- le temps d’activité ;
- le nombre de verres d’eau ;
- les repas saisis dans la journée.

#### Règles

- Les calories restantes correspondent à `objectif - calories consommées`.
- La progression correspond à `calories consommées / objectif × 100`.
- Le nombre de verres ne peut pas dépasser l’objectif quotidien affiché.
- L’ajout d’un repas met immédiatement à jour le total consommé.
- L’ajout d’une recette au journal utilise les calories enregistrées pour cette recette.

#### États particuliers

- Si le total dépasse l’objectif, la valeur restante peut devenir négative dans une version future et doit être présentée sans message culpabilisant.
- En l’absence de repas, une invitation à ajouter le premier repas doit être affichée.
- Si aucune donnée sportive n’existe, les cartes affichent zéro avec une invitation à commencer.

### 2.2 Profil et calcul du besoin calorique

Le profil demande :

- le sexe utilisé par la formule ;
- l’âge en années ;
- la taille en centimètres ;
- le poids en kilogrammes ;
- le niveau d’activité.

#### Niveaux d’activité

| Niveau | Coefficient |
| --- | ---: |
| Peu actif | 1,2 |
| Légèrement actif | 1,375 |
| Actif | 1,55 |
| Très actif | 1,725 |

#### Formule actuelle

L’application utilise la formule de Mifflin-St Jeor.

Pour un homme :

`MB = 10 × poids + 6,25 × taille - 5 × âge + 5`

Pour une femme :

`MB = 10 × poids + 6,25 × taille - 5 × âge - 161`

Le besoin journalier est ensuite calculé ainsi :

`besoin = métabolisme de base × coefficient d’activité`

Le résultat est arrondi à la dizaine la plus proche.

#### Validations recommandées

- Âge : 15 à 100 ans.
- Taille : 120 à 230 cm.
- Poids : 35 à 300 kg.
- Tous les champs doivent accepter uniquement des nombres cohérents.
- Toute valeur anormale doit déclencher un message explicite.

#### Avertissement

Le résultat est indicatif. L’interface doit rappeler qu’il ne constitue pas un diagnostic ou une prescription médicale.

### 2.3 Journal alimentaire

L’utilisateur peut :

- consulter ses repas du jour ;
- voir le nom et les aliments principaux ;
- voir les calories de chaque repas ;
- ajouter un repas manuellement ;
- ajouter une recette enregistrée ;
- démarrer une analyse à partir d’une photo.

#### Ajout manuel

Les données minimales sont :

- nom du repas ;
- calories.

Évolutions prévues :

- heure ;
- catégorie : petit-déjeuner, déjeuner, dîner ou collation ;
- protéines, glucides, lipides et fibres ;
- taille de portion ;
- commentaire personnel.

### 2.4 Analyse d’un repas par photo

#### Parcours

1. L’utilisateur touche « Photographier mon repas ».
2. Sur mobile, l’appareil photo arrière est proposé.
3. L’utilisateur prend une photo ou choisit une image.
4. Un aperçu de l’image est affiché.
5. L’application indique qu’une analyse est en cours.
6. Une estimation calorique et les aliments détectés sont présentés.
7. L’utilisateur peut confirmer l’ajout au journal.

#### État actuel du prototype

Le prototype gère la prise ou la sélection de l’image, son aperçu, l’état de chargement et le parcours de confirmation. L’estimation affichée est simulée localement.

#### Version connectée attendue

Une version de production doit connecter :

- un service de reconnaissance visuelle des aliments ;
- une base nutritionnelle ;
- un moteur d’estimation des portions.

L’utilisateur doit pouvoir corriger :

- les aliments reconnus ;
- la quantité ;
- la méthode de cuisson ;
- l’unité ;
- le résultat calorique final.

#### Message obligatoire

Toute estimation visuelle doit être présentée comme approximative. Une photographie seule ne permet pas de connaître précisément le poids, les matières grasses utilisées ou la composition d’une sauce.

### 2.5 Hydratation

L’espace hydratation affiche :

- le nombre de verres consommés ;
- l’objectif de huit verres ;
- une représentation visuelle de la progression ;
- un bouton d’ajout rapide.

Évolutions prévues :

- retrait d’un verre ajouté par erreur ;
- choix du volume d’un verre ;
- objectif personnalisé en millilitres ;
- rappels configurables ;
- historique journalier et hebdomadaire.

### 2.6 Activité et statistiques

La page Activité présente :

- le temps d’activité de la semaine ;
- une comparaison avec la semaine précédente ;
- un graphique sur sept jours ;
- le nombre de pas du jour ;
- les calories brûlées ;
- le pourcentage de l’objectif atteint.

#### Source des données

Dans le prototype, les statistiques sont des données de démonstration. Une version de production pourra utiliser :

- Apple Health ;
- Health Connect sur Android ;
- une saisie manuelle ;
- des objets connectés compatibles.

### 2.7 Défis et tâches sportives

L’utilisateur peut :

- consulter les activités prévues ;
- voir leur durée ou leur horaire ;
- cocher une activité terminée ;
- décocher une activité cochée par erreur ;
- créer rapidement un nouvel objectif ;
- suivre le nombre de tâches terminées.

#### Comportement

- Une tâche cochée change visuellement d’état.
- Son intitulé est barré.
- Le compteur terminé/total est recalculé immédiatement.
- Une tâche nouvellement créée reçoit un statut « à planifier » dans le prototype.

#### Évolutions prévues

- formulaire complet de création ;
- date et heure ;
- durée ;
- répétition ;
- type d’activité ;
- niveau d’intensité ;
- rappel ;
- calories estimées ;
- suppression et modification ;
- calendrier hebdomadaire.

### 2.8 Carnet de recettes

La page Recettes permet :

- de consulter les recettes enregistrées ;
- de saisir une recette trouvée sur un site, dans un livre ou auprès d’un proche ;
- de renseigner son nom et ses ingrédients ;
- de préciser le temps, les portions, les calories et les protéines ;
- de laisser les informations inconnues vides ;
- d’obtenir une estimation automatique ;
- d’ajouter les calories d’une recette au journal.

#### Données d’une recette

| Champ | Obligatoire | Description |
| --- | --- | --- |
| Nom | Oui | Nom lisible de la recette |
| Ingrédients | Oui | Liste libre séparée par des virgules ou retours à la ligne |
| Temps | Non | Durée en minutes |
| Portions | Non | Nombre de personnes ou portions |
| Calories | Non | Valeur calorique estimée |
| Protéines | Non | Quantité en grammes |

#### Remplissage automatique actuel

Lorsque les données sont absentes :

- les portions prennent une valeur par défaut de 2 ;
- le temps est estimé selon le nombre d’ingrédients, avec un minimum de 15 minutes ;
- les calories sont estimées selon le nombre d’ingrédients ;
- les protéines utilisent le nombre d’ingrédients et un bonus si certains aliments protéinés sont reconnus.

Les mots actuellement reconnus pour le bonus protéique comprennent notamment :

- poulet ;
- œuf ;
- tofu ;
- saumon ;
- thon ;
- lentille.

#### Limite du prototype

Le calcul local ne connaît pas les quantités exactes. Il s’agit d’une estimation d’interface et non d’une analyse nutritionnelle fiable.

#### Moteur cible

Pour la production, chaque ligne d’ingrédient devra être structurée :

- quantité ;
- unité ;
- aliment ;
- préparation éventuelle.

Exemple : `200 g de poulet cuit`.

Le moteur devra :

1. reconnaître l’aliment ;
2. convertir l’unité en grammes ;
3. interroger une base nutritionnelle ;
4. additionner les nutriments ;
5. diviser le total par le nombre de portions ;
6. signaler les ingrédients non reconnus ;
7. autoriser la correction manuelle.

Les calories et protéines devront indiquer clairement si elles concernent la recette entière ou une portion. La recommandation est d’afficher les valeurs **par portion**.

### 2.9 Thèmes et personnalisation

L’utilisateur peut choisir parmi six thèmes :

| Thème | Mode | Intention |
| --- | --- | --- |
| Sauge | Clair | Naturel et apaisant |
| Nuit | Sombre | Fond presque noir et accent vert |
| Océan | Clair | Bleu frais et énergique |
| Lavande | Clair | Violet doux |
| Terracotta | Clair | Tons chauds et organiques |
| Minuit | Sombre | Fond noir-violet |

#### Comportement

- Le thème se sélectionne dans la page Profil.
- Chaque option présente un aperçu de ses couleurs.
- Le thème sélectionné est immédiatement appliqué.
- Le choix est conservé dans le stockage local du navigateur.
- Le thème est restauré au prochain chargement.
- Les thèmes sombres déclarent un mode de couleur sombre pour les contrôles natifs.

#### Accessibilité des thèmes

- Le contraste texte/fond doit viser WCAG AA.
- Une information ne doit jamais reposer uniquement sur la couleur.
- Les états sélectionnés utilisent couleur, contour et coche.
- Une évolution pourra ajouter l’option « suivre le système ».

---

## 3. Navigation

La barre principale comporte cinq entrées :

1. **Accueil** : résumé quotidien.
2. **Activité** : statistiques et défis sportifs.
3. **Ajouter** : action centrale ouvrant les ajouts rapides.
4. **Recettes** : carnet et création de recettes.
5. **Profil** : calcul calorique et thèmes.

Le bouton central « Ajouter » propose :

- ajouter un repas ;
- ajouter une activité.

Les panneaux secondaires s’affichent sous forme de feuille modale depuis le bas de l’écran.

---

## 4. Parcours utilisateurs

### 4.1 Première utilisation

1. L’utilisateur ouvre l’application.
2. Une future étape d’accueil explique la finalité du service.
3. L’utilisateur renseigne son profil.
4. Son besoin calorique est calculé.
5. Il choisit éventuellement un thème.
6. Il arrive sur son tableau de bord.

### 4.2 Ajouter un repas manuellement

1. Ouvrir « Ajouter » ou la section Repas.
2. Choisir « Un repas ».
3. Saisir un nom et les calories.
4. Valider.
5. Vérifier la mise à jour du tableau de bord.

### 4.3 Ajouter un repas par photo

1. Toucher « Photographier mon repas ».
2. Prendre ou choisir une photo.
3. Attendre l’estimation.
4. Vérifier le résultat.
5. Ajouter au journal.

### 4.4 Créer une recette incomplète

1. Ouvrir « Recettes ».
2. Toucher « Ajouter une recette ».
3. Saisir le nom et les ingrédients.
4. Laisser les champs inconnus vides.
5. Toucher « Enregistrer et compléter ».
6. Consulter les valeurs estimées sur la nouvelle carte.

### 4.5 Planifier et terminer une activité

1. Ouvrir « Activité ».
2. Ajouter un défi.
3. Réaliser l’activité.
4. Cocher la tâche.
5. Vérifier la progression.

### 4.6 Changer de thème

1. Ouvrir « Profil ».
2. Descendre jusqu’à « Choisir un thème ».
3. Sélectionner l’une des six options.
4. Constater le changement immédiat.
5. Fermer et rouvrir l’application pour vérifier la persistance.

---

## 5. Règles métier

### 5.1 Calories

- Toutes les valeurs sont exprimées en kilocalories.
- Une recette doit préciser si sa valeur est totale ou par portion.
- Une estimation automatique doit être identifiable comme telle.
- Une correction utilisateur prend toujours priorité sur une estimation.

### 5.2 Protéines

- Les protéines sont exprimées en grammes.
- La valeur cible doit être calculée par portion pour une recette.
- Une valeur absente peut être estimée mais doit rester modifiable.

### 5.3 Dates

- Les données quotidiennes utilisent la date locale de l’utilisateur.
- Un changement de journée crée un nouveau journal.
- Les défis récurrents doivent conserver leur historique.

### 5.4 Suppression

Toute suppression de repas, recette ou activité devra demander confirmation ou proposer une annulation temporaire.

### 5.5 Données estimées

Le système doit conserver la provenance de chaque valeur :

- saisie par l’utilisateur ;
- calculée par une formule ;
- estimée par analyse ;
- importée depuis un service.

---

## 6. Modèle de données recommandé

### 6.1 Utilisateur

```text
User
- id
- firstName
- sexForFormula
- birthDate
- heightCm
- weightKg
- activityLevel
- calorieGoal
- waterGoalMl
- selectedTheme
- createdAt
- updatedAt
```

### 6.2 Entrée alimentaire

```text
MealEntry
- id
- userId
- date
- category
- name
- calories
- proteinGrams
- carbohydrateGrams
- fatGrams
- portionLabel
- sourceType
- imageUrl
- createdAt
```

### 6.3 Recette

```text
Recipe
- id
- userId
- name
- preparationMinutes
- cookingMinutes
- portions
- totalCalories
- caloriesPerPortion
- proteinPerPortion
- instructions
- imageUrl
- isEstimated
- createdAt
- updatedAt
```

### 6.4 Ingrédient

```text
RecipeIngredient
- id
- recipeId
- foodId
- rawText
- quantity
- unit
- calories
- proteinGrams
- isEstimated
```

### 6.5 Activité

```text
ActivityEntry
- id
- userId
- type
- date
- durationMinutes
- distanceMeters
- steps
- caloriesBurned
- sourceType
```

### 6.6 Défi sportif

```text
SportTask
- id
- userId
- title
- scheduledAt
- durationMinutes
- recurrence
- completed
- completedAt
- reminderEnabled
```

### 6.7 Hydratation

```text
WaterEntry
- id
- userId
- date
- amountMl
- createdAt
```

---

## 7. Exigences ergonomiques

- Conception mobile prioritaire.
- Actions principales accessibles au pouce.
- Taille tactile recommandée d’au moins 44 × 44 points.
- Hiérarchie claire entre données principales et secondaires.
- Retour visuel immédiat après une action.
- Formulaires courts et explicites.
- Unités toujours visibles.
- Navigation constante sur les pages principales.
- Aucun message moralisateur en cas de dépassement.
- États de chargement pour les analyses longues.
- États vides avec une prochaine action évidente.

---

## 8. Accessibilité

- Navigation possible au clavier sur ordinateur.
- Libellés accessibles pour les boutons uniquement iconographiques.
- Association de chaque champ à un libellé.
- Contraste compatible avec WCAG AA autant que possible.
- Focus visible.
- Pas d’information véhiculée uniquement par la couleur.
- Respect futur de la préférence de réduction des animations.
- Texte redimensionnable sans perte de contenu.
- Images de repas accompagnées d’un texte alternatif.

---

## 9. Exigences techniques

### 9.1 Socle actuel

- React 19 ;
- TypeScript ;
- Vite ;
- Tailwind CSS v4 disponible ;
- CSS personnalisé basé sur des variables de thème.

### 9.2 État actuel des données

Les données sont conservées dans l’état React pendant la session, à l’exception du thème qui utilise `localStorage`.

### 9.3 Architecture cible

Pour une version complète :

- front-end React ;
- API sécurisée ;
- base de données relationnelle ;
- stockage objet pour les photos ;
- authentification ;
- service nutritionnel externe ;
- service d’analyse d’images ;
- synchronisation santé facultative.

### 9.4 Persistance

À terme, les repas, recettes, profils et activités doivent être enregistrés dans une base associée au compte utilisateur. Le stockage local peut servir de cache et de mode hors ligne.

### 9.5 Performance

- Premier affichage rapide sur connexion mobile.
- Compression des photos avant envoi.
- Chargement différé des historiques.
- Limitation des appels à l’API nutritionnelle.
- Mise en cache des aliments déjà reconnus.

### 9.6 Sécurité

- Connexions chiffrées.
- Contrôle d’accès par utilisateur.
- Validation serveur de toutes les entrées.
- Limitation de taille et de type pour les images.
- Suppression des métadonnées sensibles des photos.
- Protection contre les injections et abus d’API.
- Aucun secret dans le code client.

---

## 10. Données personnelles et santé

Les informations de poids, d’alimentation et d’activité peuvent être sensibles.

Le produit devra :

- demander uniquement les données utiles ;
- expliquer leur usage ;
- obtenir un consentement clair ;
- permettre l’export ;
- permettre la suppression du compte et des données ;
- définir une durée de conservation ;
- éviter toute publicité exploitant des données de santé ;
- documenter les sous-traitants ;
- respecter le RGPD pour les utilisateurs européens.

Les photos de repas doivent pouvoir être supprimées indépendamment des entrées nutritionnelles.

---

## 11. Notifications envisagées

Les notifications sont facultatives et configurables :

- rappel d’hydratation ;
- rappel d’un défi sportif ;
- invitation à compléter le journal ;
- résumé de fin de journée ;
- encouragement après une série d’objectifs atteints.

Chaque type doit pouvoir être désactivé séparément.

---

## 12. Indicateurs de réussite

- Taux de profils complétés.
- Nombre moyen de jours suivis par semaine.
- Nombre de repas ajoutés.
- Utilisation de la photo par rapport à la saisie manuelle.
- Nombre de recettes enregistrées.
- Pourcentage de tâches sportives terminées.
- Rétention à 7 et 30 jours.
- Taux de correction des estimations automatiques.
- Temps moyen nécessaire pour enregistrer un repas.

Les indicateurs ne doivent pas encourager une utilisation compulsive.

---

## 13. Critères d’acceptation principaux

### Profil

- Un changement de poids, taille, âge, sexe ou activité permet de recalculer l’objectif.
- Le nouvel objectif apparaît sur le profil et l’accueil.

### Repas

- L’ajout d’un repas augmente le total calorique.
- Les calories restantes sont recalculées.

### Photo

- Une image peut être sélectionnée.
- Son aperçu est visible.
- Un état d’analyse est affiché.
- Le résultat peut être ajouté au journal.

### Activité

- Une tâche peut être cochée et décochée.
- Le compteur de progression est correct.
- Une nouvelle tâche peut être ajoutée.

### Recette

- Le nom et les ingrédients sont obligatoires.
- Les autres champs peuvent rester vides.
- Les champs vides reçoivent une estimation.
- La recette apparaît immédiatement dans la liste.
- Ses calories peuvent être ajoutées au journal.

### Thème

- Six thèmes sont disponibles.
- Au moins un thème possède un fond noir et un autre un fond blanc.
- Le changement est immédiat.
- Le choix survit à un rechargement.

---

## 14. Plan de développement recommandé

### Phase 1 — Prototype interactif

- Tableau de bord.
- Profil et formule calorique.
- Hydratation.
- Journal alimentaire.
- Activités cochables.
- Carnet de recettes.
- Six thèmes.

### Phase 2 — Persistance

- Authentification.
- Base de données.
- Historique.
- Modification et suppression.
- Synchronisation multiappareil.

### Phase 3 — Intelligence nutritionnelle

- Base d’aliments.
- Analyse structurée des ingrédients.
- Calcul par portion.
- Reconnaissance d’image connectée.
- Correction des résultats.

### Phase 4 — Santé et engagement

- Apple Health et Health Connect.
- Notifications.
- Objectifs hebdomadaires.
- Graphiques d’évolution.
- Export des données.

### Phase 5 — Qualité de production

- Tests automatisés.
- Audit d’accessibilité.
- Audit sécurité et RGPD.
- Mesure de performance.
- Tests utilisateurs.
- Publication mobile ou Progressive Web App.

---

## 15. Hors périmètre actuel

- Diagnostic médical.
- Prescription nutritionnelle.
- Paiement et abonnement.
- Réseau social.
- Coaching humain.
- Reconnaissance réelle des aliments sans API.
- Synchronisation avec une montre connectée.
- Sauvegarde distante.

Ces fonctions peuvent faire l’objet d’un lot ultérieur.

---

## 16. Conclusion

L’application combine suivi nutritionnel, hydratation, activité, motivation et recettes dans une expérience mobile cohérente. Le prototype valide les parcours essentiels et l’organisation visuelle. La priorité d’une prochaine phase devra être la persistance des données, suivie d’un véritable moteur nutritionnel capable de justifier et corriger ses estimations.

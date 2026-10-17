// Conseils du jour (cahier v2 § 1) : 107 conseils locaux, classés par thème, disponibles hors
// connexion. Repères généraux de nutrition et d'hygiène de vie (type « Manger Bouger ») :
// pas de conseil médical. Un conseil par jour, le même toute la journée.

export const tipThemes = {
  hydratation: "Hydratation",
  assiette: "Assiette équilibrée",
  proteines: "Protéines",
  fibres: "Fibres, fruits et légumes",
  sucre: "Sucre",
  sel: "Sel et gras",
  courses: "Courses et étiquettes",
  cuisine: "En cuisine",
  activite: "Activité",
  sommeil: "Sommeil et récupération",
  suivi: "Suivi et pesée",
  motivation: "Motivation",
} as const;
export type TipTheme = keyof typeof tipThemes;
export type Tip = { id: number; theme: TipTheme; text: string };

const raw: [TipTheme, string][] = [
  ["hydratation", "Un grand verre d'eau au réveil : ton corps sort de 7 à 8 heures sans boire."],
  ["hydratation", "Garde une bouteille d'eau en vue : on boit davantage quand l'eau est à portée de main."],
  ["hydratation", "Un verre d'eau à chaque repas, c'est déjà 600 à 800 ml dans la journée."],
  ["hydratation", "Soif, fatigue ou mal de tête en fin de journée : pense d'abord à boire un verre d'eau."],
  ["hydratation", "Le thé et les tisanes non sucrés comptent dans l'hydratation, au même titre que l'eau."],
  ["hydratation", "Eau pétillante, rondelle de citron, feuilles de menthe : de quoi varier sans sucre."],
  ["hydratation", "Il fait chaud ou tu as fait du sport ? Augmente tes apports en eau ce jour-là."],
  ["hydratation", "Les sodas et jus, même 100 % fruits, apportent beaucoup de sucre : garde-les pour le plaisir."],
  ["hydratation", "Des urines claires dans la journée sont un bon signe d'hydratation."],
  ["assiette", "Une assiette équilibrée : la moitié de légumes, un quart de féculents, un quart de protéines."],
  ["assiette", "Mange assis·e, sans écran : on perçoit mieux la satiété."],
  ["assiette", "Prendre 20 minutes pour un repas laisse le temps au signal de satiété d'arriver."],
  ["assiette", "Commence le repas par les légumes : ils calent sans beaucoup de calories."],
  ["assiette", "Une petite assiette donne l'impression d'une portion plus généreuse."],
  ["assiette", "Le petit-déjeuner n'est pas obligatoire : l'important, c'est l'équilibre sur la journée."],
  ["assiette", "Les féculents complets (pain, pâtes, riz) tiennent mieux au corps que les raffinés."],
  ["assiette", "Une collation peut aider à éviter de trop manger au dîner : fruit, yaourt, poignée d'amandes."],
  ["assiette", "Varie les couleurs dans l'assiette : chaque légume apporte d'autres vitamines."],
  ["proteines", "Des protéines à chaque repas aident à rester rassasié·e plus longtemps."],
  ["proteines", "Œufs, fromage blanc, skyr : des protéines faciles pour le petit-déjeuner."],
  ["proteines", "Lentilles, pois chiches, haricots : des protéines végétales, des fibres en plus."],
  ["proteines", "Le poisson deux fois par semaine, dont un poisson gras (sardine, maquereau, saumon)."],
  ["proteines", "Limite la charcuterie et la viande rouge : la volaille et les légumineuses les remplacent bien."],
  ["proteines", "Un yaourt nature ou un fromage blanc fait une collation riche en protéines."],
  ["proteines", "Céréales + légumineuses (riz et lentilles, semoule et pois chiches) : un duo complet."],
  ["proteines", "Le tofu et le tempeh prennent bien les marinades : sauce soja, ail, gingembre."],
  ["proteines", "Une boîte de thon ou de sardines au placard, c'est un repas protéiné en 5 minutes."],
  ["fibres", "Le repère : environ 30 g de fibres par jour. Fruits, légumes, légumineuses et céréales complètes."],
  ["fibres", "Garde la peau des fruits et des légumes bien lavés : c'est là que sont beaucoup de fibres."],
  ["fibres", "Une poignée de légumes surgelés se cuit en 5 minutes : aucune excuse le soir."],
  ["fibres", "Des légumineuses deux fois par semaine au moins : lentilles, pois chiches, haricots."],
  ["fibres", "Ajoute des flocons d'avoine ou des graines au yaourt pour plus de fibres."],
  ["fibres", "Un fruit entier rassasie mieux que son jus, et garde toutes ses fibres."],
  ["fibres", "Augmente les fibres progressivement et bois davantage pour bien les digérer."],
  ["fibres", "Une soupe de légumes au dîner : des fibres, de l'eau, peu de calories."],
  ["fibres", "Crudités en entrée, légumes en accompagnement, fruit en dessert : trois occasions par repas."],
  ["sucre", "Repère le sucre sur l'étiquette : « dont sucres » dans le tableau nutritionnel."],
  ["sucre", "Un yaourt nature avec un fruit plutôt qu'un yaourt aromatisé : moins de sucre ajouté."],
  ["sucre", "Le goût du sucré s'habitue : réduis le sucre du café petit à petit."],
  ["sucre", "Les céréales du petit-déjeuner sont souvent très sucrées : compare les étiquettes."],
  ["sucre", "Une envie de sucré après le repas ? Un fruit ou un carré de chocolat noir."],
  ["sucre", "Les boissons « zéro » évitent le sucre mais gardent le goût sucré : de l'eau reste le mieux."],
  ["sucre", "Les sauces toutes prêtes (ketchup, barbecue) contiennent souvent beaucoup de sucre."],
  ["sucre", "Un dessert de temps en temps fait partie d'une alimentation équilibrée : aucun aliment n'est interdit."],
  ["sel", "Goûte avant de saler : on sale souvent par habitude."],
  ["sel", "Herbes, épices, ail, citron : de la saveur sans sel."],
  ["sel", "Pain, fromage, charcuterie et plats préparés apportent l'essentiel du sel de la journée."],
  ["sel", "Le repère : moins de 5 g de sel par jour, soit une cuillère à café pour tout ce qu'on mange."],
  ["sel", "Privilégie l'huile de colza ou d'olive : de bonnes graisses pour assaisonner."],
  ["sel", "Les fritures et les viennoiseries : à garder pour les occasions."],
  ["sel", "Une poignée de noix ou d'amandes (30 g) apporte de bonnes graisses : pas besoin de plus."],
  ["sel", "Rince les légumes en conserve : une partie du sel part avec l'eau."],
  ["courses", "Fais une liste de courses : moins d'achats imprévus, moins de gaspillage."],
  ["courses", "Évite de faire les courses le ventre vide : on achète plus de produits gras et sucrés."],
  ["courses", "Le Nutri-Score aide à comparer des produits du même rayon."],
  ["courses", "Une liste d'ingrédients courte est souvent signe d'un produit peu transformé."],
  ["courses", "Les légumes surgelés nature sont aussi nutritifs que les frais, et se gardent longtemps."],
  ["courses", "Fruits et légumes de saison : meilleur goût, meilleur prix."],
  ["courses", "Compare les produits au kilo, pas au paquet : les petits formats coûtent souvent plus cher."],
  ["courses", "Prévois tes repas de la semaine dans Feed Me : la liste de courses se fait toute seule."],
  ["courses", "Le scan du code-barres retrouve les valeurs exactes d'un produit en un instant."],
  ["cuisine", "Cuisine en double et garde une part pour le lendemain : un repas maison sans effort."],
  ["cuisine", "La cuisson vapeur ou au four demande peu de matière grasse."],
  ["cuisine", "Une cuillère à soupe d'huile, c'est environ 90 kcal : mesure-la plutôt que de verser."],
  ["cuisine", "Un plat de légumes rôtis au four : 10 minutes de préparation, et il se garde 3 jours."],
  ["cuisine", "Les épices changent un plat simple : curry, paprika, cumin, herbes de Provence."],
  ["cuisine", "Pèse les féculents secs : 60 à 80 g de riz ou de pâtes crus par personne."],
  ["cuisine", "Une omelette aux légumes, c'est un dîner complet en 10 minutes."],
  ["cuisine", "Les restes se gardent 3 à 4 jours au réfrigérateur, dans une boîte fermée."],
  ["cuisine", "Prépare tes légumes à l'avance le week-end : la semaine, il n'y a plus qu'à cuire."],
  ["activite", "Le repère : au moins 30 minutes d'activité physique par jour, marche comprise."],
  ["activite", "Prends l'escalier plutôt que l'ascenseur : quelques étages comptent."],
  ["activite", "Une marche de 15 minutes après le repas aide la digestion."],
  ["activite", "Lève-toi toutes les heures si tu travailles assis·e : quelques pas suffisent."],
  ["activite", "Descends un arrêt plus tôt du bus ou du tram pour marcher un peu plus."],
  ["activite", "Le renforcement musculaire deux fois par semaine aide à garder sa masse musculaire."],
  ["activite", "Choisis une activité qui te plaît : c'est celle que tu continueras."],
  ["activite", "Pas besoin d'une salle de sport : squats, pompes contre un mur, gainage à la maison."],
  ["activite", "Après le sport, une collation avec des protéines aide la récupération."],
  ["sommeil", "Un sommeil court augmente l'appétit le lendemain : vise 7 à 9 heures."],
  ["sommeil", "Éloigne les écrans une heure avant de dormir pour t'endormir plus facilement."],
  ["sommeil", "Un dîner léger, au moins deux heures avant le coucher, aide à bien dormir."],
  ["sommeil", "Le café peut gêner le sommeil jusqu'à 6 heures après : pas de café après 15 h."],
  ["sommeil", "Des horaires de coucher réguliers, même le week-end, aident à mieux dormir."],
  ["sommeil", "Une journée de repos après un effort intense fait partie de l'entraînement."],
  ["sommeil", "Le stress donne souvent envie de grignoter : une courte marche ou quelques respirations profondes aident."],
  ["sommeil", "Grignoter le soir devant un écran ? Une tisane chaude peut remplacer l'habitude."],
  ["suivi", "Pèse-toi le matin, à jeun, après les toilettes, avec la même balance."],
  ["suivi", "Une ou deux pesées par semaine suffisent : c'est la moyenne sur 7 jours qui compte."],
  ["suivi", "Le poids varie de ±1 kg d'un jour à l'autre à cause de l'eau : ne t'inquiète pas d'un écart."],
  ["suivi", "Note tes repas juste après les avoir mangés : on oublie vite les petits extras."],
  ["suivi", "Un repas oublié ? « Refaire un repas » le reprend avec ses quantités."],
  ["suivi", "Le tour de taille dit aussi beaucoup de choses : mesure-le une fois par mois."],
  ["suivi", "Les vêtements qui tombent mieux sont un bon signe, même si la balance stagne."],
  ["suivi", "Un plateau de quelques semaines est normal : continue tes habitudes."],
  ["suivi", "Vérifie l'étiquette d'un produit que tu manges souvent : sa fiche sera parfaite."],
  ["motivation", "Les petits changements tenus dans la durée valent mieux qu'un grand régime abandonné."],
  ["motivation", "Un écart n'efface pas tes efforts : le repas suivant est une nouvelle occasion."],
  ["motivation", "Fixe-toi un objectif de la semaine, simple et précis : « un fruit par jour »."],
  ["motivation", "Compare-toi à toi-même la semaine dernière, pas aux autres."],
  ["motivation", "Célèbre ce qui va bien : chaque jour noté est une victoire."],
  ["motivation", "Manger avec plaisir fait partie de l'équilibre : savoure tes repas."],
  ["motivation", "Prévois une solution pour les jours chargés : un plat rapide au congélateur."],
  ["motivation", "Partage un repas équilibré avec tes proches : c'est plus motivant à plusieurs."],
  ["motivation", "Fatigue, maladie, fêtes : il est normal que certaines semaines soient moins régulières."],
  ["motivation", "Sois bienveillant·e avec toi-même : on ne change pas ses habitudes en un jour."],
  ["motivation", "Écris pourquoi tu as commencé : relis-le les jours de moins bien."],
];

export const tips: Tip[] = raw.map(([theme, text], index) => ({ id: index + 1, theme, text }));

/** Le conseil du jour : le même toute la journée, un autre chaque jour (dans le désordre). */
export function dailyTip(date: string, list: Tip[] = tips) {
  const day = Math.floor(new Date(`${date}T12:00:00`).getTime() / 86_400_000);
  // Pas premier avec la taille de la liste : on parcourt tous les conseils sans suivre l'ordre des thèmes.
  return list[(day * 37) % list.length];
}

/** Conseils des 14 derniers jours, le plus récent d'abord (sans doublon). */
export function recentTips(today: string, days = 14): { tip: Tip; date: string }[] {
  const seen = new Set<number>();
  const list: { tip: Tip; date: string }[] = [];
  for (let back = 0; back < days; back += 1) {
    const day = new Date(`${today}T12:00:00`);
    day.setDate(day.getDate() - back);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const tip = dailyTip(date);
    if (!seen.has(tip.id)) { seen.add(tip.id); list.push({ tip, date }); }
  }
  return list;
}

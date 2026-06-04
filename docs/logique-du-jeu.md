# Logique du jeu

## Fonctionnement détaillé

1. La carte suit automatiquement la position du participant (si permission accordée).
2. Le navigateur demande l'autorisation de géolocalisation si nécessaire.
3. La position GPS courante est comparée aux zones chargées depuis `gameConfig.json` lors de la validation d'un lieu.
4. Si la position est dans une zone valide, la récompense associée est affichée.
5. Une validation déjà obtenue pour la même zone sur le même appareil est refusée via `localStorage`.
6. L'onglet `Carte` affiche les zones de jeu et leur état d'avancement (à découvrir / trouvées).

## Suivi GPS frugal

- Le suivi GPS continu est actif uniquement sur l'onglet `Carte` et pendant l'ouverture d'une mission.
- En dehors de ces cas, le suivi est coupé pour limiter la consommation de batterie.
- Le recentrage de la carte privilégie une position récente déjà disponible avant de relancer une mesure GPS.

## Badge qualité GPS

- Le badge GPS affiché dans l'en-tête de l'onglet `Carte` s'appuie sur `coords.accuracy` (estimation native du système).
- Le badge est visible dans l'onglet `Carte` et indique un niveau de qualité (vert, jaune, rouge).
- Si la mesure est trop ancienne, absente ou trop incertaine, le badge reste affiché en rouge (qualité faible).

## Carte à imprimer

- Dans l'application, l'onglet `Carte` montre les positions des zones de jeu (centres de zones).
- Le script `scripts/build-zones.js` génère un fichier `print/carte_des_lieux.html` qui permet de visualiser les POI regroupés par secteurs approximatifs pour impression.
- Ce document n'est pas intégré à l'application, il est généré séparément.
- Ouvrez `print/carte_des_lieux.html` dans un navigateur puis lancez l'impression (PDF ou papier).

## Sécurité et vie privée

- Aucune photo n'est demandée.
- Aucune donnée sensible n'est demandée.
- Aucun tracking, cookie tiers ou analytics n'est intégré.
- Les validations restent sur l'appareil via `localStorage`.

## Limitations connues

- La précision GPS varie selon le téléphone, l'environnement (intérieur/extérieur) et les conditions réseau.
- La géolocalisation web exige une page HTTPS (ou localhost en local).
- Si l'utilisateur refuse la permission, la validation est impossible tant que la permission n'est pas réautorisée.
- En navigation privée, certains navigateurs peuvent effacer `localStorage` plus agressivement.

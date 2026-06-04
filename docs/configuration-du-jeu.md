# Configuration du jeu (JSON)

Le jeu repose sur deux fichiers JSON :

- `scripts/ile_de_re.json` (ou un autre descripteur) : source éditable pour définir le jeu.
- `gameConfig.json` : configuration runtime lue par l'application.

## Génération de la configuration runtime

```bash
node scripts/build-zones.js ./scripts/ile_de_re.json --check
node scripts/build-zones.js ./scripts/ile_de_re.json --force
```

Comportement du script :

- `--check` : valide le JSON sans écrire de fichier.
- `--force` : autorise l'écrasement de `gameConfig.json` et `print/carte_des_lieux.html` (avec confirmation).
- Sorties écrites : `gameConfig.json` et `print/carte_des_lieux.html`.

## Récompenses attribuées à chaque POI

Le script applique un ordre précis pour remplir les récompenses des lieux :

1. Il découpe `solution.value` avec `solution.split`.
2. Chaque fragment obtenu devient une récompense de type `REWARD`.
3. Les fragments sont placés aléatoirement sur les lieux éligibles.

Un lieu est éligible s'il n'est pas marqué `specialType: "GPS_TEST"`.

Si le nombre de fragments dépasse le nombre de lieux éligibles, la génération échoue avec une erreur (pour éviter un jeu incohérent).

## Signification de `NOTHING`

Quand il reste des lieux sans fragment de solution :

- le script tente d'abord d'y placer des défis photo,
- puis il complète le reste avec des récompenses `NOTHING`.

`NOTHING` signifie :

- pas d'indice pour la phrase cachée,
- un lieu qui peut quand même être validé,
- un message visuel côté joueur du type « pas d'indice ».

Cas particulier GPS :

- un lieu `GPS_TEST` reçoit toujours une récompense `NOTHING` avec un message informatif,
- ce lieu ne reçoit jamais de fragment de solution.

## Questions : attribution et types de réponses

Les questions sont gérées en deux modes :

- `places[].question` : question fixée sur un lieu précis,
- `questions[]` : pool global distribué aléatoirement.

La distribution aléatoire des questions globales se fait après l'attribution des récompenses, sur les lieux éligibles qui n'ont pas déjà une question fixe.

Chaque question accepte deux formats de validation :

- `exactAnswer` : réponse texte exacte attendue,
- `minWords` : nombre minimum de mots dans la réponse.

Règles :

- il faut `prompt` + (`exactAnswer` ou `minWords`),
- `exactAnswer` et `minWords` sont mutuellement exclusifs.

## Défis photo

Le tableau `defis[]` contient les titres de défis photo.

Comportement :

- les défis photo sont mélangés aléatoirement,
- ils sont attribués aux lieux restants après placement des fragments de solution,
- si tous les lieux restants sont déjà occupés, les défis en trop sont ignorés (avec avertissement en sortie du script).

## Structure du descripteur source

Structure générale attendue :

```json
{
  "game": {
    "name": "Nom du jeu",
    "version": "2026-05-29.1",
    "startAt": "2026-06-01T14:00:00+02:00",
    "defaultRadiusMeter": 50
  },
  "solution": {
    "value": "Phrase solution",
    "split": "mot"
  },
  "map": {
    "gridMeters": 2300
  },
  "branding": {
    "siteTitle": "Titre en-tête",
    "siteLogo": "./assets/logo.svg"
  },
  "homeMarkdownLines": ["# Programme", "## Jour 1", "- Activité 1"],
  "questions": [
    { "prompt": "Question 1", "exactAnswer": "Réponse attendue" },
    { "prompt": "Question 2", "minWords": 4 }
  ],
  "defis": ["Défi photo 1", "Défi photo 2"],
  "places": [
    {
      "hint": "Indice",
      "name": "Nom du lieu",
      "coordinates": "46.20, -1.36",
      "radiusMeters": 80,
      "anecdote": "Texte optionnel",
      "question": { "prompt": "Question locale", "exactAnswer": "Réponse" },
      "specialType": "GPS_TEST",
      "testMessage": "Message test GPS"
    }
  ]
}
```

Règles utiles :

- `solution.split` : `syllable`, `word` ou `mot`.
- `questions[]` et `places[].question` : chaque question doit contenir `prompt` et soit `exactAnswer`, soit `minWords`.
- `exactAnswer` et `minWords` sont mutuellement exclusifs.
- `places[].specialType = "GPS_TEST"` : lieu réservé au test de géolocalisation, sans fragment de solution.
- `homeMarkdownLines` : supporte `#`, `##` et puces `-` ou `*`.

## Exemple précis: scripts/ile_de_re.json

Le fichier `scripts/ile_de_re.json` est un exemple concret de descripteur source complet.

Il illustre :

- des métadonnées de jeu (`game`),
- une phrase solution (`solution`),
- des réglages de regroupement cartographique (`map`),
- un contenu d'accueil (`homeMarkdownLines`),
- des questions globales (`questions`) avec `exactAnswer` et `minWords`,
- des défis photo (`defis`),
- une liste de lieux (`places`) avec des champs optionnels (`radiusMeters`, `anecdote`, `question`),
- un point test géolocalisation (`specialType: "GPS_TEST"`, `testMessage`).

# COP

Les boîtes de nuit et bars dansants, vérifiés, sur une carte. Première ville : Bordeaux. Paris suit.

**Appli en ligne :** https://adrinvl.github.io/COP/

## Ce que fait cette version

- Carte sombre des lieux, liste en panneau à faire glisser, fiche détaillée par lieu.
- Filtres par type de lieu (club, bar dansant, péniche, warehouse) et par musique.
- Recherche par nom, quartier ou style.
- « Me localiser » : tri par distance et temps de marche estimé.
- Itinéraire vers Plans (Apple) ou Google Maps, partage d'un lien direct vers la fiche.
- Statut de vérification visible sur chaque lieu (vérifié, à vérifier, ouverture annoncée).
- S'installe sur l'écran d'accueil de l'iPhone (Safari → Partager → Sur l'écran d'accueil).

## Mettre à jour les lieux

Les lieux sont dans `data/bordeaux.json`. Chaque lieu a un `status` :

| Valeur | Affichage |
| --- | --- |
| `confirme` | Vérifié, visible par défaut |
| `annonce` | Ouverture annoncée, visible par défaut |
| `a-verifier` | Masqué, sauf si l'option « Inclure les lieux à vérifier » est activée |

Le champ `geo` sert à placer le lieu sur la carte (adresse cherchée via la Géoplateforme IGN, puis gardée en mémoire dans le navigateur).

## Technique

- Site statique, sans compte ni clé : HTML, CSS et JavaScript.
- Carte : [MapLibre GL JS](https://maplibre.org/) 5.24.1 (inclus dans `assets/vendor`) et tuiles [OpenFreeMap](https://openfreemap.org/).
- Adresses : [Géoplateforme IGN](https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage).
- Hébergement : GitHub Pages, branche `main`, dossier racine.

## Prochaines étapes

- Lieux de Paris.
- Note Google et nombre d'avis, distance par Google Maps (clé Google Cloud nécessaire).
- Comptes, avis COP et favoris.
- Applications iOS et Android.

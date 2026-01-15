# Documentation de l'Application Web E3-S1-Geomatic

## Introduction

L'application web E3-S1-Geomatic est une interface utilisateur interactive permettant de visualiser géographiquement les entreprises en France avec leurs offres d'emploi et les transports en commun à proximité. Elle utilise Leaflet pour l'affichage cartographique et communique avec des fichiers de données générés par le parser pour présenter une carte interactive avec des fonctionnalités de recherche, de filtrage et de calcul d'itinéraires.

## Structure du projet

```
e3-s1-geomatic-app/
├── index.html                 # Page principale de l'application
├── style.css                  # Styles globaux de l'application
├── data/                      # Données générées par le parser
│   ├── entreprises.geojson    # Données des entreprises avec localisation
│   ├── offre_by_siret.json    # Offres d'emploi par entreprise
│   ├── stations_by_siret.json # Stations de transport par entreprise
│   ├── transport_stations.json # Détails des stations de transport
│   └── graph.json             # Graphe des connexions de transport
└── src/
    ├── main.js                # Point d'entrée principal
    ├── internal/
    │   ├── config/
    │   │   └── config.js      # Configuration des chemins de données
    │   ├── managers/
    │   │   ├── dataManager.js # Gestion des données de l'application
    │   │   ├── favoritesManager.js # Gestion des favoris
    │   │   ├── mapManager.js  # Gestion de la carte Leaflet
    │   │   ├── pathFinder.js  # Calculateur d'itinéraires
    │   │   └── uiManager.js   # Orchestrateur de l'interface utilisateur
    │   └── utils/
    │       ├── minHeap.js     # Implémentation d'un tas minimal
    │       └── pahFinder.js   # Algorithme de recherche de chemin
    └── ui/
        ├── favoriteComponent/ # Composant des favoris
        │   ├── favoritesComponent.js
        │   └── favoriteComponent.css
        ├── modalComponent/    # Modale d'affichage des détails
        │   ├── modalComponent.js
        │   └── modalComponent.css
        ├── navigationComponent/ # Barre de navigation
        │   ├── navigationComponent.js
        │   └── navigationComponent.css
        ├── resultsComponent/  # Liste des résultats
        │   ├── resultsComponent.js
        │   └── resultsComponent.css
        ├── routeDetailsComponent/ # Détails d'itinéraire
        │   ├── routeDetailsComponent.js
        │   └── routeDetailsComponent.css
        ├── searchComponent/   # Barre de recherche et filtres
        │   ├── searchComponent.js
        │   └── searchComponent.css
        └── transportComponent/ # Indicateur de stations
            ├── transportComponent.js
            └── transportComponent.css
```

## Architecture de l'application

L'application suit une architecture modulaire basée sur des classes ES6 avec une séparation claire des responsabilités :

1. **Managers** : Gèrent la logique métier (données, carte, interface)
2. **Composants UI** : Gèrent l'affichage et l'interaction avec l'utilisateur
3. **Utils** : Fonctions utilitaires (algorithmes, structures de données)

### Gestion des données

#### DataManager
Responsable du chargement, de la mise en cache et du filtrage des données. Il gère :
- Le chargement lazy des fichiers JSON/GeoJSON
- Le filtrage des entreprises selon plusieurs critères
- La jointure entre les différentes sources de données

#### FavoritesManager
Gère les offres favorites avec persistance dans le localStorage :
- Ajout/suppression d'offres
- Notification des observateurs en cas de changement
- Normalisation des données pour le stockage

### Gestion de la carte

#### MapManager
Gère l'affichage cartographique avec Leaflet :
- Affichage des marqueurs d'entreprises avec clustering (Leaflet.markercluster)
- Affichage des stations de transport avec icônes personnalisées
- Gestion de la géolocalisation utilisateur
- Tracé des itinéraires avec polyline et marqueurs
- Prévisualisation du rayon de recherche

### Gestion de l'interface utilisateur

#### UIManager
Orchestrateur de l'interface utilisateur :
- Instanciation et coordination des composants UI
- Gestion du mode focus (dépliage d'un widget masque les autres)
- Coordination entre les différents modules

## Composants de l'interface utilisateur

### SearchComponent
Widget de recherche et de filtrage :
- Barre de recherche textuelle avec debounce (attendre 300ms pour les saisies textuelles (optimisation performance))
- Filtres avancés (secteur, taille, rayon, score de transport)
- Sélecteurs personnalisés avec multi-sélection
- Curseurs pour le rayon de recherche et le score de desservance
- Prévisualisation du rayon sur la carte

### FavoritesComponent
Gestion des entreprises et offres favorites :
- Stockage dans le localStorage
- Affichage de la liste des favoris
- Export des favoris

### ResultsComponent
Affichage des résultats de recherche :
- Liste des entreprises trouvées
- Tri par pertinence ou distance
- Indication du nombre d'offres par entreprise

### ModalComponent
Modale d'affichage des détails :
- Informations sur l'entreprise
- Liste des offres d'emploi
- Détails d'une offre spécifique
- Affichage des stations de transport à proximité

## Fonctionnalités principales

### Visualisation cartographique
- Carte interactive avec fond OpenStreetMap (via Leaflet)
- Marqueurs personnalisés pour les entreprises
- Clustering intelligent des marqueurs selon la densité
- Marqueurs spécifiques pour les stations de transport
- Position utilisateur avec marqueur animé

### Calcul d'itinéraire
- Calcul d'itinéraire entre la position utilisateur et une entreprise
- Affichage du tracé sur la carte
- Détails de l'itinéraire avec arrêts et correspondances

#### PathFinder
Implémente l'algorithme A* pour le calcul d'itinéraire :
- Utilisation d'un graphe de transport pré-calculé
- Optimisation avec tas min (MinHeap)
- Calcul du chemin le plus court entre deux points

## Technologies utilisées

- **HTML5/CSS3** : Structure et styles de l'application
- **JavaScript ES6+** : Logique de l'application avec classes et modules
- **Leaflet** : Bibliothèque cartographique
- **Leaflet.markercluster** : Clustering des marqueurs
- **Font Awesome** : Icônes
- **LocalStorage** : Persistance des données utilisateur

## Flux de données et configuration

### Fichiers de données requis

L'application nécessite 5 fichiers de données générés par le parser :

1. **entreprises.geojson** : Données géolocalisées des entreprises avec métadonnées
2. **offre_by_siret.json** : Offres d'emploi groupées par identifiant d'entreprise
3. **stations_by_siret.json** : Mapping entreprises ↔ stations de transport
4. **transport_stations.json** : Détails des stations (noms, coordonnées, modes)
5. **graph.json** : Graphe des connexions entre stations pour le calcul d'itinéraire

## Performance et optimisations

### Chargement des données
- Chargement lazy (à la demande) des fichiers de données volumineux
- Mise en cache des données déjà chargées
- Préchargement progressif avec indicateur visuel

### Affichage cartographique
- Clustering des marqueurs pour les grandes quantités
- Chargement progressif des marqueurs (chunked loading)
- Optimisation des icônes personnalisées

### Interface utilisateur
- Animations fluides avec transitions CSS
- Mode focus pour améliorer la lisibilité
- Debounce sur les entrées utilisateur pour réduire les calculs

## Configuration

L'application utilise un système de configuration centralisée dans `src/internal/config/config.js` :

```javascript
export const CONFIG = {
  paths: {
    companies: "./data/entreprises.geojson",
    offers: "./data/offre_by_siret.json",
    stationsMapping: "./data/stations_by_siret.json",
    stationsDetails: "./data/transport_stations.json",
    graph: "./data/graph.json",
  },
};
```

## Gestion des erreurs

L'application inclut une gestion d'erreurs robuste :
- Vérification de la disponibilité des fichiers de données
- Gestion des erreurs de géolocalisation
- Messages d'erreur utilisateur clairs
- Continuation malgré les erreurs partielles

## Design et expérience utilisateur

### Principes de design
- Interface épurée avec effet de verre (glassmorphism)
- Palette de couleurs cohérente et accessible
- Feedback visuel immédiat pour les interactions
- Animations subtiles pour améliorer l'expérience

### Composants visuels
- Marqueurs d'entreprises avec badge du nombre d'offres
- Clusters animés avec indicateurs de densité
- Curseurs stylisés pour les filtres
- Modales avec transitions fluides
- Effets de flou sur la carte en mode focus

## Exemple d'utilisation

```javascript
// Initialisation de l'application
const dataManager = new DataManager();
const favManager = new FavoritesManager();
const mapManager = new MapManager("map");
const pathFinder = new PathFinder();

// Chargement des données
await dataManager.init();

// Affichage des marqueurs
const geoJson = dataManager.getCompanies();
mapManager.addCompanyMarkers(geoJson, (companyProps) => {
  // Callback lors du clic sur un marqueur
  console.log("Entreprise sélectionnée:", companyProps);
});
```

## Limitations

- L'application nécessite une connexion internet pour charger les données et la carte
- La précision du calcul d'itinéraire dépend de la qualité des données GTFS
- Le nombre d'entreprises affichées dépend des capacités du navigateur
- La géolocalisation doit être activée pour certaines fonctionnalités
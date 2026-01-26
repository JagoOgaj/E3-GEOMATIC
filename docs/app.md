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
    │       ├── const.js       # Constantes
    │       ├── distance.js    # Fonctions pour calcul de distance
    │       └── minHeap.js     # Implémentation d'un tas minimal
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

## Informations cartographiques générales
- Carte interactive avec fond [CartoDB](https://github.com/CartoDB/basemap-styles) (via Leaflet)
- Marqueurs personnalisés pour les entreprises
- Clustering intelligent des marqueurs selon la densité
- Position utilisateur avec marqueur

## Architecture de l'application

L'application suit une architecture basée sur des classes avec une séparation des responsabilités :

1. **Managers** : Gèrent la logique métier (données, carte, interface)
2. **Composants UI** : Gèrent l'affichage et l'interaction avec l'utilisateur
3. **Utils** : Fonctions utilitaires (algorithmes, structures de données)

### Gestion des données

#### DataManager
Responsable du chargement, mise en cache et filtrage des données. Fonctionnalités :
- **Chargement lazy** : Les fichiers sont chargés uniquement quand nécessaire
- **Cache mémoire** : Données conservées pour éviter les rechargements
- **Filtrage intelligent** : Recherche floue (distance de Levenshtein) + filtres géographiques
- **Jointure de données** : Association entreprises ↔ offres ↔ stations

#### FavoritesManager
Gère la persistance des offres favorites :
- **LocalStorage** : Stockage client avec clé `geojob_favorites`
- **Pattern Observer** : Notifie les composants des changements
- **Normalisation** : Uniformisation des données pour le stockage

### Gestion de la carte

#### MapManager
Interface cartographique avec Leaflet :
- **Clustering** : Regroupement des marqueurs avec Leaflet.markercluster
- **Marqueurs personnalisés** : Icônes spécifiques selon le type (entreprise, station, utilisateur)
- **Gestion des couches** : Isolation des informations selon le contexte
- **Calculs géographiques** : Prévisualisation de rayon, centrage automatique

### Gestion de l'interface utilisateur

#### UIManager
Coordonne les différents composants UI :
- **Instanciation** : Création et initialisation des widgets
- **Communication** : Liaison entre composants via callbacks
- **Mode focus** : Gestion de l'attention utilisateur (floutage carte, masquage widgets)

## Composants de l'interface utilisateur

### SearchComponent : Recherche et filtrage
**Caractéristiques techniques** :
- **Debounce** : Attente 300ms pour les saisies textuelles (optimisation performance)
- **Filtres cumulatifs** : 6 critères combinables (secteur, taille, rayon, etc.)
- **Prévisualisation** : Affichage du rayon de recherche sur la carte en temps réel

### FavoritesComponent : Gestion des favoris
**Caractéristiques techniques** :
- **Persistance LocalStorage** : Stockage côté client avec clé `geojob_favorites`
- **Pattern Observer** : Notification automatique des composants abonnés lors des changements
- **Normalisation des données** : Uniformisation des structures pour garantir la cohérence
- **Export des favoris** : Possibilité d'exporter la liste des favoris au format TXT, JSON ou CSV

### ResultsComponent : Liste des résultats
Affichage des résultats de recherche :
- Liste des entreprises trouvées
- Tri par pertinence ou distance
- Indication du nombre d'offres par entreprise

**Optimisations** :
- **Pagination infinie** : Chargement par lots de 25 entreprises avec IntersectionObserver
- **Accordéon dynamique** : Chargement lazy des offres au clic sur l'entreprise
- **Mise à jour en temps réel** : Synchronisation avec les favoris
- **Export des résultats** : Possibilité d'exporter les résultats de recherche au format TXT, JSON ou CSV

### Fonctionnalité d'export
L'application offre la possibilité d'exporter les offres d'emploi trouvées dans deux composants différents :
- **ResultsComponent** : Export des résultats de recherche
- **FavoritesComponent** : Export des offres favorites

#### Formats d'export disponibles
Trois formats d'export sont disponibles pour les deux composants :
- **Format texte (.txt)** : Fichier texte contenant les différentes offres avec nom de l'entreprise, nom de l'offre et URL de candidature, séparées par des sauts de ligne
- **JSON** : Fichier JSON contenant un tableau d'objets avec les propriétés `companyName`, `offerName` et `applyUrl`
- **CSV** : Fichier CSV avec en-têtes `companyName`, `offerName` et `applyUrl`

### ModalComponent : Système de modales
**Deux modes d'affichage** :
1. **Liste d'offres** : Overlay léger pour la sélection rapide
2. **Détail complet** : Modale riche avec toutes les informations et actions, dont stations de transport à proximité

### TransportComponent & RouteDetailsComponent
**Fonctionnalités spécialisées** :
- **Visualisation transport** : Indicateur de stations affichées sur la carte
- **Détails itinéraire** : Affichage du trajet calculé avec étapes et temps estimé

### Calcul d'itinéraire

Le système de calcul d'itinéraire permet de déterminer le trajet optimal en transport en commun entre la position de l'utilisateur et une entreprise cible.

#### Architecture du système

1. **PathFinder** (`src/internal/managers/pathFinder.js`) : Calculateur d'itinéraire principal
2. **MapManager** (`src/internal/managers/mapManager.js`) : Gestion de l'affichage cartographique
3. **RouteDetailsComponent** (`src/ui/routeDetailsComponent/routeDetailsComponent.js`) : Affichage détaillé du trajet

#### Données utilisées

Le calcul utilise un graphe de transport pré-calculé (`graph.json`) fait par le Parser à partir des données GTFS. Il a :
- **Noeuds** : Stations de transport avec coordonnées géographiques
- **Arêtes** : Connexions entre stations avec poids (temps de trajet) et métadonnées (ligne, type de transport)

#### Algorithme A* optimisé

Le PathFinder implémente une version adaptée de l'algorithme A* avec les optimisations suivantes :

**Heuristique géographique** :
- Utilisation de la distance haversine (aérienne) entre le noeud courant et la destination

**Gestion des correspondances** :
- Pénalité de 300 secondes pour les changements de ligne non nécessaires
- Conservation du contexte de ligne pour éviter les changements inutiles

**Optimisations de performance** :
- **Tas minimal (MinHeap)** : Structure de données pour extraire efficacement le nœud avec le coût minimal
- **Limite d'itérations** : 50 000 itérations maximum pour éviter les boucles infinies
- **Recherche spatiale** : Boîte de délimitation (0.1°) pour trouver les noeuds les plus proches

**Consolidation du chemin** :
- Regroupement des arrêts consécutifs sur la même ligne
- Simplification de l'affichage pour l'utilisateur
- Calcul du nombre d'arrêts par segment

#### Détail du calcul

1. **Initialisation** : Chargement asynchrone du fichier `graph.json` via `fetch()`

2. **Recherche des noeuds de départ et d'arrivée** :
   - Trouver le noeud le plus proche de la position utilisateur dans un rayon de 0.1°
   - Trouver le noeud le plus proche des coordonnées de l'entreprise

3. **Exécution de l'algorithme A*** :
   - Initialisation des structures : `costSoFar`, `cameFrom`, `frontier` (MinHeap)
   - Exploration itérative des voisins avec calcul des coûts
   - Application des pénalités pour les correspondances
   - Reconstruction du chemin optimal

4. **Post-traitement** :
   - Consolidation des segments de même ligne
   - Calcul de la durée totale
   - Formatage des données pour l'affichage

## Flux d'interaction utilisateur

### Séquence de recherche
1. Utilisateur saisit du texte ou ajuste des filtres
2. SearchComponent envoie les critères à DataManager après délai (debounce)
3. DataManager filtre les données et renvoie un GeoJSON réduit
4. MapManager met à jour les marqueurs sur la carte
5. ResultsComponent affiche la liste correspondante
6. Utilisateur clique sur un marqueur ou un élément de liste
7. ModalComponent affiche les offres disponibles
8. Utilisateur sélectionne une offre pour voir le détail

### Séquence de calcul d'itinéraire
1. Utilisateur clique sur "Itinéraire" dans la modale de détail
2. PathFinder récupère le graphe des transports et exécute l'algorithme A*
3. MapManager dessine la ligne de trajet et les points d'étape
4. RouteDetailsComponent affiche les détails du parcours
5. L'interface bascule en mode itinéraire (masquage des autres widgets)

## Technologies utilisées

- **HTML/CSS** : Structure et styles de l'application
- **JavaScript** : Logique de l'application avec classes et modules
- **Leaflet** : Bibliothèque cartographique
- **Leaflet.markercluster** : Clustering des marqueurs
- **Font Awesome** : Icônes
- **LocalStorage** : Persistance des données utilisateur

## Configuration

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
- **Clustering** : Regroupement automatique selon le niveau de zoom
- **Chargement progressif** : Marqueurs ajoutés par lots pour éviter le blocage (chunk loading)

### Interface utilisateur
- Animations fluides avec transitions CSS
- Mode focus pour améliorer la lisibilité
- Debounce sur les entrées utilisateur pour réduire les calculs

### Algorithmes
- **Recherche floue** : Distance de Levenshtein pour les correspondances approximatives
  - Dans `src/internal/managers/dataManager.js`
- **Calcul de distance** : Formule haversine pour les distances géodésiques
  - Dans `src/internal/managers/dataManager.js`
- **Recherche de chemin** : Algorithme A* avec tas min pour l'optimisation
  - Dans `src/internal/managers/pathFinder.js`

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

## Limitations

- L'application nécessite une connexion internet pour charger les données et la carte (les fonds de carte et certains CSS sont hébergés en ligne par des serveurs tiers)
- La géolocalisation doit être activée
- Hérite des limitations des datasets et du parser :
  - Seules les entreprises en **France** et possédant des **offres d'apprentissage** provenant de **la bonne alternance** sont affichées.
  - Calcul d'itinéraire :
    - Le calcul de temps de trajet est basé sur des approximations. Une solution pré-calculée précise s'avérerait inexploitable car trop grande. L'utilisation forcée de JavaScript vanilla en front-end empêche de maximiser les performances.
    - Les itinéraires possibles sont limités afin de maintenir des performances optimales et de réduire la quantité de données qui doivent transiter par le réseau.
  - Les datasets mis à disposition :
    - Sont parfois modifiés ou supprimés de façon imprévue, ce qui crée des problèmes dans le recoupement de certaines données.
    - Sont parfois imprécis et de nombreux champs ne sont pas renseignés.

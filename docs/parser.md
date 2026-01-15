# Documentation du Parser E3-S1-Geomatic

## Introduction

Le parser E3-S1-Geomatic est un pipeline de traitement de données qui agrège des offres d'emploi, des informations d'entreprises (SIRENE) et des données de transport public pour créer un graphe géospatial interactif. Il extrait, transforme et charge des données provenant de multiples sources pour produire des fichiers JSON structurés utilisables par l'application frontend.

## Structure du projet

```
e3-s1-geomatic-parser/
├── index.js                      # Point d'entrée principal
├── pipeline/
│   └── pipeline.js              # Orchestrateur du traitement des offres
├── const/
│   └── graph.const.js           # URLs des datasets GTFS
├── repositories/
│   ├── offerRepository.js       # Lecture et normalisation des offres
│   ├── sireneRepository.js      # Accès aux données SIRENE
│   └── stopRepository.js        # Recherche d'arrêts de transport
├── internal/
│   ├── aggregator/
│   │   └── datasetAggregator.js # Agrégation des datasets
│   ├── initializer/
│   │   ├── sireneInitializer.js # Initialisation DB SIRENE
│   │   └── transportInitializer.js # Initialisation DB transports
│   ├── config/
│   │   └── config.js           # Gestion de la configuration
│   ├── dbPool/
│   │   └── dbPool.js           # Pool de connexions DuckDB
│   ├── graph/
│   │   ├── graphBuilder.js     # Construction du graphe final
│   │   └── geoCalculator.js    # Calculs géospatiaux
│   ├── transport/
│   │   ├── gtfs/
│   │   │   ├── gtfsDownloader.js # Téléchargement GTFS
│   │   │   └── gtfsParser.js    # Parsing GTFS
│   │   ├── transportManager.js  # Gestion des données transport
│   │   └── transportFinalizer.js # Finalisation transport
│   └── utils/
│       ├── consoleLock.js       # Utilitaires console
│       ├── priorityQueue.js     # File de priorité
│       └── minHeap.js           # Tas min
└── .env.defaults               # Configuration par défaut
```

## Configuration

Le parser utilise un système de configuration basé sur des variables d'environnement. Les chemins des fichiers d'entrée/sortie et les paramètres de base de données sont configurés dans `.env` ou `.env.defaults`.

Le fichier `.env` a une priorité plus importante que `.env.defaults`. Le `.env` n'est pas créé par défaut. La meilleure façon de configurer l'application est donc de copier `.env.defaults` et renommer la copie en `.env` qu'on pourra modifier.

## Étapes du pipeline

### Phase 1 : Initialisation de la base de données
**Fichiers concernés :**
- `internal/initializer/sireneInitializer.js`
- `internal/initializer/transportInitializer.js`
- `internal/dbPool/dbPool.js`

La base de données **DuckDB** est utilisée car c'est une base de données rapide, optimisée pour traiter et accéder à des grandes quantités de données.

Cette phase initialise deux tables dans DuckDB :
1. **Table SIRENE** : Chargée depuis un fichier Parquet contenant les informations des entreprises françaises
   - **Variable d'environnement** : `PATH_SOURCE_SIRENE` (chemin vers le fichier `.parquet`)
2. **Table transport_stops** : Chargée depuis un CSV unifié des arrêts de transport
   - **Variable d'environnement** : `PATH_SOURCE_STOP_CSV` (chemin vers le fichier `.csv`)

Les index sont créés pour optimiser les recherches :
- SIRENE : indexes sur siret, siren, code postal, etc.
- Transports : **index géospatial composite** (stop_lat, stop_lon)
  - Un **index géospatial composite** est un index créé sur deux colonnes (latitude et longitude) simultanément pour accélérer les requêtes spatiales. Dans DuckDB, cet index permet d'optimiser les recherches de proximité en créant une structure de données qui prend en compte la relation entre les deux dimensions spatiales. Concrètement, l'index `idx_transport_geo` sur les colonnes `stop_lat` et `stop_lon` permet de rapidement filtrer les arrêts dans une zone géographique donnée sans avoir à scanner toute la table.

### Phase 2 : Pipeline et agrégation
**Fichiers concernés :**
- `pipeline/pipeline.js`
- `repositories/offerRepository.js`
- `repositories/sireneRepository.js`
- `repositories/stopRepository.js`
- `internal/aggregator/datasetAggregator.js`

**Processus :**
1. **Lecture des offres d'alternance** : Stream JSON avec `stream-json` pour éviter la surcharge mémoire
   - **Variable d'environnement** : `PATH_SOURCE_OFFERS_JSON` (chemin vers le fichier JSON des offres)
2. **Enrichissement SIRENE** : Association des offres avec les données entreprises (SIRET, nom, secteur, etc.)
3. **Géolocalisation** : Recherche des arrêts de transport dans un rayon de 2km
    - **Variable d'environnement** : `PATH_SOURCE_STOP_CSV` (chemin vers le fichier CSV des arrêts de transport)
4. **Agrégation** : Regroupement par entreprise/localisation

**Sorties générées :**
- `companies.geojson` : Features GeoJSON des entreprises avec métadonnées
  - **Variable d'environnement** : `PATH_OUTPUT_COMPANIES_GEOJSON`
- `offers_by_siret.json` : Offres groupées par identifiant d'entreprise
  - **Variable d'environnement** : `PATH_OUTPUT_OFFERS_BY_SIRET_JSON`
- `transport_stop.json` : Référentiel complet des arrêts de transport
  - **Variable d'environnement** : `PATH_OUTPUT_TRANSPORT_STOP_JSON`
- `stop_by_siret.json` : Liens entre entreprises et arrêts proches
  - **Variable d'environnement** : `PATH_OUTPUT_STOP_BY_SIRET_JSON`
- `transport_required.json` : Les IDs des datasets à télécharger pour la phase 3 (datasets de données de transports liés aux entreprises traitées).
  - **Variable d'environnement** : `PATH_OUTPUT_REQUIRED_DATASETS`

### Phase 3 : Traitement des données de transport
**Fichiers concernés :**
- `internal/transport/gtfs/gtfsDownloader.js`
- `internal/transport/transportManager.js`
- `internal/transport/transportFinalizer.js`
- `internal/transport/gtfs/gtfsParser.js`

**Processus :**
1. **Téléchargement GTFS** : Récupération des datasets de transport depuis data.gouv.fr
    - Télécharge les GTFS via les ID des datasets donnés dans le chemin vers le fichier JSON des arrêts de transport.
      -  **Variable d'environnement** : `PATH_OUTPUT_REQUIRED_DATASETS` (chemin vers le fichier JSON généré dans la phase 2)
    - Seuls les GTFS des arrêts associés aux entreprises sont téléchargés (les arrêts trop éloignés des entreprises ne le sont pas).
2. **Parsing GTFS** : Extraction des stops, routes, trips et stop_times
    - Référence : https://gtfs.org/fr/documentation/schedule/reference/
3. **Construction du cache** : Agrégation des données transport par région
4. **Finalisation** : Nettoyage et préparation pour la construction du graphe

**Variables d'environnement utilisées :**
- `PATH_CACHE_GTFS` : Dossier de cache pour les fichiers GTFS téléchargés

### Phase 4 : Construction du graphe
**Fichiers concernés :**
- `internal/graph/graphBuilder.js`
- `internal/graph/geoCalculator.js`
- `const/graph.const.js`

**Processus :**
1. **Téléchargement des datasets** : Liste d'URLs prédéfinies (définies dans `graph.const.js`)
    - Les GTFS dans récupérés dans la phase 3 ne sont pas utilisés car trop nombreux et rendraient les calculs trop compliqué et endommagerait les performances. Les GTFS les plus grands ont été récupérés afin d'avoir le meilleur compromis.
2. **Calcul des distances** : Utilisation de la formule haversine pour les distances géodésiques
3. **Construction du graphe** : Création d'un graphe orienté avec :
   - Nœuds : Arrêts de transport
   - Arêtes : Connexions entre arrêts (même ligne) ou correspondances
   - Poids : Temps de trajet ou distance

**Variable d'environnement :**
- `PATH_OUTPUT_GRAPH_JSON` : Chemin vers le fichier JSON du graphe final

## Formats d'entrée et de sortie

### Entrées
1. **Offres d'emploi (JSON)**
```json
{
  "identifier": { "id": "12345" },
  "workplace": {
    "siret": "12345678901234",
    "legal_name": "Entreprise Example",
    "location": {
      "geopoint": { "coordinates": [2.3522, 48.8566] },
      "address": "123 Rue Example, Paris"
    },
    "domain": { "naf": { "code": "6201Z" } },
    "size": "50-99"
  },
  "offer": {
    "title": "Développeur Fullstack",
    "description": "Poste de développeur...",
    "target_diploma": "BAC+5"
  },
  "contract": {
    "type": "CDI",
    "start": "2024-01-15",
    "duration": "Permanent"
  }
}
```

2. **Données SIRENE (Parquet)**
   - Structure standard SIRENE : siret, siren, denomination, code postal, etc.

3. **Arrêts de transport (CSV)**
```
stop_id,stop_name,stop_lat,stop_lon,dataset_id,resource_id,dataset_custom_title,dataset_datagouv_id,resource_datagouv_id
"123","Gare du Nord",48.8800,2.3550,"dataset-1","resource-1","Transports IDF","id1","rid1"
```

### Sorties
1. **Graphe de transport (JSON)**
```json
{
  "nodes": [
    {
      "id": "stop_123",
      "name": "Gare du Nord",
      "lat": 48.8800,
      "lon": 2.3550,
      "type": "stop",
      "dataset_source": "Transports IDF"
    }
  ],
  "edges": [
    {
      "from": "stop_123",
      "to": "stop_456",
      "weight": 300,
      "type": "same_line",
      "line": "RER B",
      "agency": "SNCF"
    }
  ]
}
```

2. **Entreprises avec transports (GeoJSON)**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "12345678901234_48.8566_2.3522",
      "geometry": {
        "type": "Point",
        "coordinates": [2.3522, 48.8566]
      },
      "properties": {
        "siret": "12345678901234",
        "storage_id": "12345678901234_48.8566_2.3522",
        "company": "Entreprise Example",
        "sector": { "naf": "6201Z", "label": "Programmation informatique" },
        "size": "50-99",
        "is_virtual": false,
        "transport_score": 85,
        "isPublic": false,
        "stations_count": 5,
        "offers_count": 3
      }
    }
  ]
}
```

3. **Offres par entreprise (JSON)**
```json
{
  "12345678901234_48.8566_2.3522": [
    {
      "offerId": "12345",
      "title": "Développeur Fullstack",
      "contractType": "CDI",
      "offerDescription": "Poste de développeur...",
      "applyUrl": "https://example.com/apply",
      "targetDiploma": "BAC+5",
      "contractDuration": "Permanent",
      "contractStart": "2024-01-15",
      "accessConditions": ["BAC+5"],
      "desiredSkills": ["JavaScript", "React", "Node.js"]
    }
  ]
}
```

## Exemple complet d'exécution

```bash
# Installation des dépendances
npm install

# Configuration
cp .env.defaults .env
# Éditer .env avec les chemins appropriés

# Exécution
node e3-s1-geomatic-parser/index.js
```

**Sortie console typique :**
```
Starting Application
Phase 1: DB Initialization: 45.67s
Phase 2: Pipeline & Aggregation: 120.34s
Processed: 15000 offers | Companies: 4500 | Speed: 125 offers/s
Phase 3: Transport Processing: 89.23s
Phase 4: Graph Building: 210.45s
All operations completed successfully.
```

## Gestion des erreurs

Le pipeline inclut une gestion d'erreurs robuste :
- Validation des fichiers d'entrée
- Logging détaillé des erreurs
- Continuation sur erreur pour les offres individuelles
- Nettoyage des ressources (fermeture DB)

## Performances

- **Streaming JSON** : Traitement de fichiers volumineux sans surcharge mémoire
- **Parallélisation** : Utilisation de `p-limit` pour limiter le nombre de requêtes concurrentes
- **Indexation** : Index DuckDB optimisés pour les recherches SIRENE et géospatiales
- **Cache** : Mise en cache des datasets GTFS pour éviter les téléchargements répétés

## Dépendances principales

- `duckdb` : Base de données embarquée
- `stream-json` : Traitement streaming des JSON
- `p-limit` : Limitation de concurrence
- `node-fetch` : Téléchargement HTTP
- `dotenv` : Gestion des variables d'environnement

## Limitations

- Seules les entreprises en **France** et possédant des **offres d'apprentissage** provenant de **la bonne alternance** sont affichées.
- Calcul d'itinéraire :
  - Le calcul de temps de trajet est basé sur des approximations. Une solution pré-calculée précise s'avérerait inexploitable car trop grande. L'utilisation forcée de JavaScript vanilla en front-end empêche de maximiser les performances.
  - Les itinéraires possibles sont limités afin de maintenir des performances optimales et de réduire la quantité de données qui doivent transiter par le réseau.
- Les datasets mis à disposition :
  - Sont parfois modifiés ou supprimés de façon imprévue, ce qui crée des problèmes dans le recoupement de certaines données.
  - Sont parfois imprécis et de nombreux champs ne sont pas renseignés.
/**
 * Configuration globale de l'application.
 * Contient les chemins d'accès vers les fichiers de données (JSON/GeoJSON)
 * nécessaires au fonctionnement des managers.
 *
 * @constant
 * @type {Object}
 */
export const CONFIG = {
  paths: {
    companies: "./data/entreprises.geojson",
    offers: "./data/offre_by_siret.json",
    stationsMapping: "./data/stations_by_siret.json",
    stationsDetails: "./data/transport_stations.json",
    graph: "./data/graph.json",
  },
};

// regions.config.js

const GEOFABRIK_BASE = "https://download.geofabrik.de/europe/france/";

export const REGIONS = {
  auvergne_rhone_alpes: {
    name: "Auvergne-Rhône-Alpes",
    pbfUrls: [
      `${GEOFABRIK_BASE}auvergne-latest.osm.pbf`,
      `${GEOFABRIK_BASE}rhone-alpes-latest.osm.pbf`,
    ],
    bbox: { minLat: 44.1, minLon: 2.0, maxLat: 46.8, maxLon: 7.2 },
  },
  bourgogne_franche_comte: {
    name: "Bourgogne-Franche-Comté",
    pbfUrls: [
      `${GEOFABRIK_BASE}bourgogne-latest.osm.pbf`,
      `${GEOFABRIK_BASE}franche-comte-latest.osm.pbf`,
    ],
    bbox: { minLat: 46.2, minLon: 2.8, maxLat: 48.4, maxLon: 7.1 },
  },
  bretagne: {
    name: "Bretagne",
    pbfUrls: [`${GEOFABRIK_BASE}bretagne-latest.osm.pbf`],
    bbox: { minLat: 47.2, minLon: -5.2, maxLat: 48.9, maxLon: -1.0 },
  },
  centre_val_de_loire: {
    name: "Centre-Val de Loire",
    pbfUrls: [`${GEOFABRIK_BASE}centre-latest.osm.pbf`],
    bbox: { minLat: 46.3, minLon: 0.0, maxLat: 48.9, maxLon: 3.1 },
  },
  corse: {
    name: "Corse",
    pbfUrls: [`${GEOFABRIK_BASE}corse-latest.osm.pbf`],
    bbox: { minLat: 41.3, minLon: 8.5, maxLat: 43.1, maxLon: 9.6 },
  },
  grand_est: {
    name: "Grand Est",
    pbfUrls: [
      `${GEOFABRIK_BASE}alsace-latest.osm.pbf`,
      `${GEOFABRIK_BASE}champagne-ardenne-latest.osm.pbf`,
      `${GEOFABRIK_BASE}lorraine-latest.osm.pbf`,
    ],
    bbox: { minLat: 47.4, minLon: 3.3, maxLat: 50.2, maxLon: 8.3 },
  },
  hauts_de_france: {
    name: "Hauts-de-France",
    pbfUrls: [
      `${GEOFABRIK_BASE}nord-pas-de-calais-latest.osm.pbf`,
      `${GEOFABRIK_BASE}picardie-latest.osm.pbf`,
    ],
    bbox: { minLat: 48.8, minLon: 1.3, maxLat: 51.1, maxLon: 4.3 },
  },
  ile_de_france: {
    name: "Île-de-France",
    pbfUrls: [`${GEOFABRIK_BASE}ile-de-france-latest.osm.pbf`],
    bbox: { minLat: 48.1, minLon: 1.4, maxLat: 49.2, maxLon: 3.6 },
  },
  normandie: {
    name: "Normandie",
    pbfUrls: [
      `${GEOFABRIK_BASE}basse-normandie-latest.osm.pbf`,
      `${GEOFABRIK_BASE}haute-normandie-latest.osm.pbf`,
    ],
    bbox: { minLat: 48.3, minLon: -2.0, maxLat: 50.1, maxLon: 1.8 },
  },
  nouvelle_aquitaine: {
    name: "Nouvelle-Aquitaine",
    pbfUrls: [
      `${GEOFABRIK_BASE}aquitaine-latest.osm.pbf`,
      `${GEOFABRIK_BASE}limousin-latest.osm.pbf`,
      `${GEOFABRIK_BASE}poitou-charentes-latest.osm.pbf`,
    ],
    bbox: { minLat: 42.9, minLon: -1.8, maxLat: 47.1, maxLon: 2.6 },
  },
  occitanie: {
    name: "Occitanie",
    pbfUrls: [
      `${GEOFABRIK_BASE}languedoc-roussillon-latest.osm.pbf`,
      `${GEOFABRIK_BASE}midi-pyrenees-latest.osm.pbf`,
    ],
    bbox: { minLat: 42.3, minLon: -0.8, maxLat: 45.1, maxLon: 4.9 },
  },
  pays_de_la_loire: {
    name: "Pays de la Loire",
    pbfUrls: [`${GEOFABRIK_BASE}pays-de-la-loire-latest.osm.pbf`],
    bbox: { minLat: 46.2, minLon: -2.6, maxLat: 48.6, maxLon: 0.9 },
  },
  provence_alpes_cote_azur: {
    name: "Provence-Alpes-Côte d'Azur",
    pbfUrls: [`${GEOFABRIK_BASE}provence-alpes-cote-d-azur-latest.osm.pbf`],
    bbox: { minLat: 42.9, minLon: 4.2, maxLat: 45.1, maxLon: 7.8 },
  },
};

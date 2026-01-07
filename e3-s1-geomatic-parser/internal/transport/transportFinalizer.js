import fs from "fs/promises";

/**
 * Finalise le pipeline de traitement des transports.
 * Cette classe est responsable de :
 * 1. Croiser les données de liens (stations <-> entreprises) avec le cache de transport (lignes/modes).
 * 2. Calculer un score d'accessibilité pour chaque entreprise basé sur la proximité et le type de transport.
 * 3. Injecter ces métriques dans le GeoJSON final et le fichier de liens.
 *
 * @param {Object} paths - Configuration des chemins de fichiers (stationsRef, stationsLink, companies).
 */
export class TransportFinalizer {
  constructor(paths) {
    this.paths = paths;

    this.MAX_WALK_DISTANCE_KM = 1.7;

    this.SCORES = {
      TRAIN: 5,
      TRAM: 3,
      BUS: 1.5,
    };
  }

  /**
   * Exécute le processus de finalisation et de calcul de score.
   * @param {Map} transportCache - Cache contenant les infos enrichies (modes, lignes) par ID de station.
   * @returns {Promise<void>}
   */
  async run(transportCache) {
    const [stationsRef, linksData, geojsonData] = await Promise.all([
      this.#readJson(this.paths.stationsRef),
      this.#readJson(this.paths.stationsLink),
      this.#readJson(this.paths.companies),
    ]);

    for (const data of Object.values(linksData)) {
      if (!data.stations || data.stations.length === 0) {
        data._final_score = 0;
        data._summary_modes = [];
        continue;
      }

      const companyModes = new Set();
      let bestStationScore = 0;

      data.stations.forEach((stationLink) => {
        const refStation = stationsRef[stationLink.id];
        let modes = ["Bus"];

        if (refStation) {
          const transportInfo = this.#findInCache(
            transportCache,
            refStation.dataset_id,
            stationLink.id,
          );

          if (transportInfo) {
            modes = transportInfo.modes;
            stationLink.modes = modes;
            stationLink.lines = transportInfo.lines;
          }
        }

        modes.forEach((m) => companyModes.add(m));

        const score = this.#calculateIndividualScore(
          modes,
          stationLink.distance,
        );

        if (score > bestStationScore) {
          bestStationScore = score;
        }
      });

      data._summary_modes = Array.from(companyModes);
      data._final_score = parseFloat(bestStationScore.toFixed(2));
    }

    geojsonData.features.forEach((feature) => {
      const linkData =
        linksData[feature.id] || linksData[feature.properties.siret];

      if (linkData) {
        feature.properties.transport_modes = linkData._summary_modes || [];
        feature.properties.transport_score = linkData._final_score || 0;
      }
    });

    for (const data of Object.values(linksData)) {
      delete data._summary_modes;
      delete data._final_score;
    }

    await Promise.all([
      this.#writeJson(this.paths.stationsLink, linksData),
      this.#writeJson(this.paths.companies, geojsonData),
    ]);
  }

  /**
   * Calcule le score d'accessibilité d'une station en fonction de la distance et des modes.
   * Applique une décroissance linéaire (Linear Decay) selon la distance.
   * @param {Array<string>} modes - Liste des modes de transport disponibles.
   * @param {number} distanceMeters - Distance à la station en mètres.
   * @returns {number} Le score calculé.
   * @private
   */
  #calculateIndividualScore(modes, distanceMeters) {
    const distanceKm = distanceMeters / 1000;

    if (distanceKm > this.MAX_WALK_DISTANCE_KM) return 0;

    let baseScore = this.SCORES.BUS;

    const hasHeavyRail = modes.some((m) =>
      ["Train", "Métro", "Metro", "RER"].some((k) => m.includes(k)),
    );
    const hasLightRail = modes.some((m) =>
      ["Tram", "Tramway"].some((k) => m.includes(k)),
    );

    if (hasHeavyRail) {
      baseScore = this.SCORES.TRAIN;
    } else if (hasLightRail) {
      baseScore = this.SCORES.TRAM;
    }

    const decayFactor = 1 - distanceKm / this.MAX_WALK_DISTANCE_KM;

    return baseScore * decayFactor;
  }

  /**
   * Récupère les informations d'une station dans le cache global.
   * @param {Map} cache - Le cache de transport.
   * @param {string} datasetId - L'ID du dataset source.
   * @param {string} stationId - L'ID de la station.
   * @returns {Object|null} Les données de transport ou null.
   * @private
   */
  #findInCache(cache, datasetId, stationId) {
    const key = `${datasetId}:${stationId}`;
    return cache.get(key) || null;
  }

  /**
   * Helper pour lire et parser un fichier JSON.
   * @param {string} filePath
   * @returns {Promise<Object>}
   * @private
   */
  async #readJson(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  }

  /**
   * Helper pour sérialiser et écrire un fichier JSON.
   * @param {string} filePath
   * @param {Object} data
   * @returns {Promise<void>}
   * @private
   */
  async #writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }
}

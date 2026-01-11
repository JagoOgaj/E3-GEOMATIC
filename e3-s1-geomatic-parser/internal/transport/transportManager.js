import fsPromises from "node:fs/promises";
import { writeFileSync, appendFileSync } from "node:fs";
import { GtfsParser } from "./gtfs/gtfsParser.js";

/**
 * Gestionnaire principal des données de transport.
 * Orchestre le téléchargement (via Downloader), le parsing (via GtfsParser)
 * et la consolidation des données GTFS pour les stations demandées.
 *
 * @param {Object} config - Chemins des fichiers de configuration.
 * @param {Object} downloader - Instance du Downloader (gère l'API et les fichiers ZIP).
 */
export class TransportManager {
  constructor(config, downloader) {
    this.paths = config;
    this.downloader = downloader;
    this.cache = new Map();
    this.debugLogPath = "./dataset/output/debug_gtfs_trace.txt";
  }

  /**
   * Charge, télécharge et parse les données de transport nécessaires.
   * @returns {Promise<Map>} Le cache des données de transport enrichies.
   */
  async loadTransportData() {
    console.log("Loading transport data");

    this.#initLog();

    const [stationsRef, rawDatasets] = await Promise.all([
      this.#readJson(this.paths.stationsRef),
      this.#readJson(this.paths.requiredDatasets),
    ]);

    const datasetMap = this.#groupDatasets(rawDatasets);
    const uniqueIds = Array.from(datasetMap.keys());

    console.log(`Treatment of ${uniqueIds.length} datasets`);

    const CONCURRENCY_LIMIT = 5;

    await this.#runWithConcurrency(
      uniqueIds,
      async (datasetId) => {
        const candidates = datasetMap.get(datasetId);
        await this.#processOneDataset(datasetId, candidates, stationsRef);
      },
      CONCURRENCY_LIMIT,
    );

    console.log("Transport data loading complete.");
    return this.cache;
  }

  /**
   * Traite un dataset unique de bout en bout (Download -> Parse -> Cache).
   * @param {string} datasetId - ID du dataset.
   * @param {Array} candidates - Liste des ressources candidates pour cet ID.
   * @param {Object} stationsRef - Référentiel complet des stations.
   * @private
   */
  async #processOneDataset(datasetId, candidates, stationsRef) {
    const targetStations = this.#getTargetStations(datasetId, stationsRef);

    if (targetStations.length === 0) return;

    try {
      const folderPath = await this.downloader.download(datasetId, candidates);

      if (!folderPath) {
        this.#appendLog(`SKIP Dataset ${datasetId}`);
        return;
      }

      this.#appendLog(
        `\nDATASET ${datasetId} : ${targetStations.length} stations to map`,
      );

      const parser = new GtfsParser(
        folderPath,
        this.debugLogPath,
        targetStations,
      );
      const result = await parser.parse();

      this.#updateCache(datasetId, result);
    } catch (err) {
      this.#appendLog(`CRITICAL ERROR Dataset ${datasetId}: ${err.message}`);
      console.error(`Error on ${datasetId}:`, err.message);
    }
  }

  /**
   * Met à jour le cache global avec les résultats du parsing.
   * @param {string} datasetId
   * @param {Object} parseResult - { mapping, modes, lines }
   * @private
   */
  #updateCache(datasetId, parseResult) {
    if (!parseResult.mapping) return;

    for (const [userTargetId, gtfsIds] of parseResult.mapping) {
      const uniqueKey = `${datasetId}:${userTargetId}`;

      const aggregatedModes = new Set();
      const aggregatedLines = new Set();

      for (const gtfsId of gtfsIds) {
        const modesFound = parseResult.modes.get(gtfsId);
        const linesFound = parseResult.lines.get(gtfsId);

        if (modesFound) modesFound.forEach((m) => aggregatedModes.add(m));
        if (linesFound) linesFound.forEach((l) => aggregatedLines.add(l));
      }

      if (aggregatedModes.size > 0) {
        this.cache.set(uniqueKey, {
          modes: Array.from(aggregatedModes),
          lines: Array.from(aggregatedLines),
        });
      }
    }
  }

  /**
   * Récupère les stations cibles associées à un dataset donné.
   * @param {string} datasetId
   * @param {Object} stationsRef
   * @returns {Array<{id: string, name: string}>}
   * @private
   */
  #getTargetStations(datasetId, stationsRef) {
    return Object.entries(stationsRef)
      .filter(([_, val]) => String(val.dataset_id) === datasetId)
      .map(([key, val]) => ({
        id: String(val.original_id || key),
        name: val.name ? val.name.toLowerCase() : "",
      }));
  }

  /**
   * Regroupe les datasets bruts par ID pour gérer les doublons/ressources multiples.
   * @param {Array} rawDatasets
   * @returns {Map<string, Array>} Map<dataset_id, candidates[]>
   * @private
   */
  #groupDatasets(rawDatasets) {
    const map = new Map();

    for (const ds of rawDatasets) {
      if (!ds.dataset_id) continue;
      const id = String(ds.dataset_id);

      if (!map.has(id)) map.set(id, []);
      const existing = map.get(id);

      const isDuplicate = existing.some(
        (e) =>
          e.resource_id === ds.resource_id &&
          e.resource_datagouv_id === ds.resource_datagouv_id,
      );

      if (!isDuplicate) existing.push(ds);
    }
    return map;
  }

  /**
   * Exécute une liste de tâches asynchrones avec une limite de concurrence.
   * @param {Array} items - Éléments à traiter.
   * @param {Function} taskFn - Fonction asynchrone (item) => Promise.
   * @param {number} limit - Nombre max de tâches simultanées.
   * @private
   */
  async #runWithConcurrency(items, taskFn, limit) {
    const executing = [];

    for (const item of items) {
      const p = taskFn(item).then(() => {
        executing.splice(executing.indexOf(p), 1);
      });

      executing.push(p);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }

  async #readJson(filePath) {
    return JSON.parse(await fsPromises.readFile(filePath, "utf-8"));
  }

  #initLog() {
    try {
      writeFileSync(
        this.debugLogPath,
        `=== DEBUG GTFS PROCESSING : ${new Date().toISOString()} ===\n`,
      );
    } catch (e) {
      console.warn("Unable to initialize the GTFS log file");
    }
  }

  #appendLog(msg) {
    try {
      appendFileSync(this.debugLogPath, msg + "\n");
    } catch (e) {}
  }
}

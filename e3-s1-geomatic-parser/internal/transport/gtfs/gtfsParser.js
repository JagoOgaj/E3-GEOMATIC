import fs from "fs";
import path from "path";
import csv from "csv-parser";

/**
 * Parseur GTFS polyvalent
 * Mode 1 (Stateful) : Analyse un dataset pour mapper des IDs spécifiques (via targets)
 * Mode 2 (Stateless) : Extrait les données brutes optimisées pour la construction du graphe
 *
 * Initialise le parseur avec les chemins et cibles de configuration
 * @param {string|null} datasetPath - Chemin racine du dataset (requis pour le mode Stateful)
 * @param {string|null} logFilePath - Chemin vers le fichier de log pour l'analyse
 * @param {Array<{id: string, name: string}>} targets - Liste des stations cibles à surveiller
 */
export class GtfsParser {
  constructor(datasetPath = null, logFilePath = null, targets = []) {
    this.datasetPath = datasetPath;
    this.logFilePath = logFilePath;
    this.targets = targets;

    this.stopModes = new Map();
    this.stopLines = new Map();
    this.parentMap = new Map();
    this.childrenMap = new Map();
    this.stopNames = new Map();
    this.loggedStops = new Set();
    this.idMapping = new Map();
  }

  /**
   * Lance l'analyse complète du dataset configuré dans le constructeur
   * Charge séquentiellement les fichiers pour construire les relations
   * @returns {Promise<{modes: Map, lines: Map, mapping: Map}>} Les données analysées
   * @throws {Error} Si le chemin du dataset n'est pas défini
   */
  async parse() {
    if (!this.datasetPath) {
      throw new Error(
        "GtfsParser: Dataset path is required for stateful parsing.",
      );
    }

    await this.#loadStopsData();
    const routes = await this.#loadRoutes();
    const trips = await this.#loadTrips();
    await this.#scanStopTimes(routes, trips);
    this.#propagateParentInfo();

    return {
      modes: this.stopModes,
      lines: this.stopLines,
      mapping: this.idMapping,
    };
  }

  /**
   * Charge le fichier stops.txt pour mapper les IDs, les noms et les relations parents/enfants
   * @returns {Promise<void>}
   * @private
   */
  async #loadStopsData() {
    const filePath = path.join(this.datasetPath, "stops.txt");
    if (!fs.existsSync(filePath)) return;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          const stopId = row.stop_id;
          const stopName = row.stop_name || "Unknown";
          const parentId = row.parent_station;

          this.stopNames.set(stopId, stopName);

          if (parentId) {
            this.parentMap.set(stopId, parentId);
            if (!this.childrenMap.has(parentId)) {
              this.childrenMap.set(parentId, []);
            }
            this.childrenMap.get(parentId).push(stopId);
          }
        })
        .on("error", reject)
        .on("end", resolve);
    });
  }

  /**
   * Charge le fichier routes.txt pour obtenir les types de transport et les noms de lignes
   * @returns {Promise<Map<string, {type: string, name: string}>>} Map des routes
   * @private
   */
  async #loadRoutes() {
    const routes = new Map();
    const filePath = path.join(this.datasetPath, "routes.txt");
    if (!fs.existsSync(filePath)) return routes;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          const name = row.route_short_name || row.route_long_name || "";
          const typeLabel = this.getRouteTypeLabel(row.route_type, name);

          routes.set(row.route_id, {
            type: typeLabel,
            name: name || "Unknown",
          });
        })
        .on("error", reject)
        .on("end", () => resolve(routes));
    });
  }

  /**
   * Charge le fichier trips.txt pour associer chaque voyage (trip) à une ligne (route)
   * @returns {Promise<Map<string, string>>} Map associant trip_id à route_id
   * @private
   */
  async #loadTrips() {
    const trips = new Map();
    const filePath = path.join(this.datasetPath, "trips.txt");
    if (!fs.existsSync(filePath)) return trips;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          if (row.trip_id && row.route_id) {
            trips.set(row.trip_id, row.route_id);
          }
        })
        .on("error", reject)
        .on("end", () => resolve(trips));
    });
  }

  /**
   * Parcourt le fichier stop_times.txt pour lier les arrêts aux lignes et détecter les cibles
   * @param {Map} routes - Map des routes générée par #loadRoutes
   * @param {Map} trips - Map des trips générée par #loadTrips
   * @returns {Promise<void>}
   * @private
   */
  async #scanStopTimes(routes, trips) {
    const filePath = path.join(this.datasetPath, "stop_times.txt");
    if (!fs.existsSync(filePath)) return;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          const stopId = row.stop_id;
          const tripId = row.trip_id;

          const routeId = trips.get(tripId);
          if (!routeId) return;

          const routeInfo = routes.get(routeId);
          if (!routeInfo) return;

          if (!this.loggedStops.has(stopId)) {
            const stopName = this.stopNames.get(stopId);
            const matchResult = this.#checkTargetMatch(stopId, stopName);

            if (matchResult) {
              const { target, reason } = matchResult;
              this.#appendLog(
                `MATCH [${reason}] JSON:${target.id} <-> GTFS:${stopId} (${stopName}) -> ${routeInfo.type} [${routeInfo.name}]`,
              );
              this.loggedStops.add(stopId);

              if (!this.idMapping.has(target.id)) {
                this.idMapping.set(target.id, new Set());
              }
              this.idMapping.get(target.id).add(stopId);
            }
          }

          if (!this.stopModes.has(stopId))
            this.stopModes.set(stopId, new Set());
          this.stopModes.get(stopId).add(routeInfo.type);

          if (!this.stopLines.has(stopId))
            this.stopLines.set(stopId, new Set());
          this.stopLines.get(stopId).add(routeInfo.name);
        })
        .on("error", reject)
        .on("end", resolve);
    });
  }

  /**
   * Propage les informations de transport (Lignes/Modes) entre parents et enfants
   * Assure qu'une gare parente "connaît" les lignes qui passent par ses sous-arrêts
   * @private
   */
  #propagateParentInfo() {
    for (const [childId, parentId] of this.parentMap.entries()) {
      this.#mergeStopInfo(childId, parentId);
    }
    for (const [parentId, children] of this.childrenMap.entries()) {
      if (this.stopModes.has(parentId)) {
        for (const childId of children) {
          this.#mergeStopInfo(parentId, childId);
        }
      }
    }
  }

  /**
   * Fusionne les sets de modes et de lignes d'un arrêt source vers un arrêt cible
   * @param {string} sourceId - ID de l'arrêt source
   * @param {string} targetId - ID de l'arrêt cible (généralement le parent)
   * @private
   */
  #mergeStopInfo(sourceId, targetId) {
    if (this.stopModes.has(sourceId)) {
      if (!this.stopModes.has(targetId))
        this.stopModes.set(targetId, new Set());
      const targetSet = this.stopModes.get(targetId);
      this.stopModes.get(sourceId).forEach((m) => targetSet.add(m));
    }

    if (this.stopLines.has(sourceId)) {
      if (!this.stopLines.has(targetId))
        this.stopLines.set(targetId, new Set());
      const targetSet = this.stopLines.get(targetId);
      this.stopLines.get(sourceId).forEach((l) => targetSet.add(l));
    }
  }

  /**
   * Vérifie si un arrêt correspond à l'une des cibles définies (par ID ou par Nom)
   * @param {string} gtfsId - ID de l'arrêt GTFS
   * @param {string} gtfsName - Nom de l'arrêt GTFS
   * @returns {{target: Object, reason: string}|null} Le résultat du match ou null
   * @private
   */
  #checkTargetMatch(gtfsId, gtfsName) {
    if (!this.targets || this.targets.length === 0) return null;

    const gId = String(gtfsId);
    const gName = gtfsName ? gtfsName.toLowerCase() : "";

    for (const target of this.targets) {
      if (gId.includes(target.id) || target.id.includes(gId)) {
        return { target, reason: "ID_MATCH" };
      }
      if (target.name.length > 3 && gName.includes(target.name)) {
        return { target, reason: "NAME_MATCH" };
      }
    }
    return null;
  }

  /**
   * Écrit un message dans le fichier de log si configuré
   * @param {string} message - Le message à logger
   * @private
   */
  #appendLog(message) {
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, message + "\n");
      } catch (e) {
        console.error("Log write error:", e.message);
      }
    }
  }

  /**
   * Extrait et retourne les données brutes des fichiers GTFS nécessaires au graphe
   * Cette méthode est stateless et n'utilise pas les propriétés internes de la classe
   * @param {string} datasetPath - Le dossier contenant les fichiers TXT
   * @returns {Promise<{stops: Array, routes: Array, trips: Array, stopTimes: Array}>} Les données brutes
   */
  async getGraphData(datasetPath) {
    const [stops, routes, trips, stopTimes] = await Promise.all([
      this.readCsvFile(datasetPath, "stops.txt"),
      this.readCsvFile(datasetPath, "routes.txt"),
      this.readCsvFile(datasetPath, "trips.txt"),
      this.readCsvFile(datasetPath, "stop_times.txt"),
    ]);

    return { stops, routes, trips, stopTimes };
  }

  /**
   * Lit un fichier CSV GTFS et le convertit en tableau d'objets
   * Applique une optimisation mémoire spécifique pour 'stop_times.txt'
   * @param {string} folderPath - Dossier contenant le fichier
   * @param {string} fileName - Nom du fichier (ex: 'routes.txt')
   * @returns {Promise<Array<Object>>} Tableau des lignes du CSV
   */
  readCsvFile(folderPath, fileName) {
    const filePath = path.join(folderPath, fileName);
    if (!fs.existsSync(filePath)) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const results = [];
      const isStopTimes = fileName === "stop_times.txt";

      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => {
          if (isStopTimes) {
            results.push({
              trip_id: data.trip_id,
              stop_id: data.stop_id,
              stop_sequence: data.stop_sequence,
            });
          } else {
            results.push(data);
          }
        })
        .on("error", (err) => reject(err))
        .on("end", () => resolve(results));
    });
  }

  /**
   * Détermine le label du mode de transport (RER, METRO, BUS, TRAM) normalisé.
   * Utilise une heuristique hybride basée sur le standard GTFS et les spécificités IDF
   * @param {string|number} routeType - Le code 'route_type' GTFS
   * @param {string} routeName - Le nom de la ligne (short_name ou long_name)
   * @returns {string} Le label normalisé (ex: "RER", "METRO", "BUS")
   */
  getRouteTypeLabel(routeType, routeName = "") {
    const typeInt = parseInt(routeType, 10);
    const nameUpper = routeName ? routeName.toUpperCase() : "";

    if (["A", "B", "C", "D", "E"].includes(nameUpper)) return "RER";
    if (["H", "J", "K", "L", "N", "P", "R", "U"].includes(nameUpper))
      return "TRAIN";
    if (/^T\d+/.test(nameUpper)) return "TRAM";

    const metroMatch = nameUpper.match(/^(\d+)(BIS)?$/);
    if (metroMatch) {
      const num = parseInt(metroMatch[1], 10);
      if (num > 0 && num < 20) return "METRO";
    }

    if (isNaN(typeInt)) return "BUS";
    if (typeInt === 1 || (typeInt >= 400 && typeInt <= 404)) return "METRO";
    if (typeInt === 0 || (typeInt >= 900 && typeInt <= 906)) return "TRAM";
    if (typeInt === 2 || (typeInt >= 100 && typeInt < 200)) return "TRAIN";

    return "BUS";
  }
}

import fs from "fs";
import path from "path";
import KDBush from "kdbush";
import * as geokdbush from "geokdbush";

/**
 * Construit le graphe de transport multimodal à partir des fichiers GTFS parsés
 * Gère la consolidation des arrêts (Parent Stations), la création des arcs de transport
 * et la génération des correspondances piétonnes.
 * Sauvegarde le résultat en JSON pour une compatibilité Frontend.
 *
 * @param {Object} gtfsParser - Instance du parseur GTFS capable de lire les fichiers CSV/JSON
 * @param {Object} geoCalculator - Instance de l'utilitaire de calcul de distance
 */
export class GraphBuilder {
  // Vitesse moyenne estimée pour le ferroviaire (RER, Métro, Train) en km/h
  #RAIL_SPEED_KMH = 55;

  // Vitesse moyenne estimée pour les bus/tram en km/h
  #BUS_SPEED_KMH = 20;

  // Temps moyen perdu à chaque arrêt (freinage, portes, démarrage) en secondes
  #STOP_PENALTY_SECONDS = 25;

  // Vitesse de marche pour les correspondances (km/h) -> 1.25 m/s = 4.5 km/h
  #WALK_SPEED_MS = 1.25;

  // Pénalité fixe ajoutée à toute correspondance piétonne (le temps de s'orienter/changer de quai) en secondes
  #TRANSFER_PENALTY_SECONDS = 120;

  constructor(gtfsParser, geoCalculator) {
    this.gtfsParser = gtfsParser;
    this.geoCalculator = geoCalculator;
    this.nodes = {};
    this.adjacency = {};
    this.stopIdToParentIdMap = new Map();
  }

  /**
   * Point d'entrée principal.
   * Itère sur tous les dossiers de datasets GTFS, construit le graphe en mémoire et le sauvegarde en JSON.
   * @param {string[]} datasetPaths - Liste des chemins vers les dossiers GTFS décompressés
   * @param {string} outputPath - Chemin complet du fichier de sortie (ex: .../public/graph.json)
   */
  async build(datasetPaths, outputPath) {
    console.log("GraphBuilder: Starting construction");

    if (global.gc) global.gc();

    for (const directory of datasetPaths) {
      const datasetName = path.basename(directory);
      console.log(`GraphBuilder: Processing dataset "${datasetName}"`);

      try {
        let gtfsData = await this.gtfsParser.getGraphData(directory);

        if (gtfsData.stops.length > 0 && gtfsData.stopTimes.length > 0) {
          this.#processGtfsData(gtfsData);
        }

        gtfsData = null;
        if (global.gc) global.gc();
      } catch (error) {
        console.error(
          `GraphBuilder: Error processing ${datasetName}:`,
          error.message,
        );
      }
    }

    this.#generateWalkingTransfers();
    this.#saveGraphToDisk(outputPath);
  }

  /**
   * Traite les données brutes d'un dataset GTFS pour peupler les nœuds et les arcs
   * @param {Object} data - Données GTFS (stops, routes, trips, stopTimes)
   * @private
   */
  #processGtfsData({ stops, routes, trips, stopTimes }) {
    const routesMap = new Map(routes.map((r) => [r.route_id, r]));
    const tripsMap = new Map(trips.map((t) => [t.trip_id, t]));

    stops.forEach((stop) => {
      if (!stop.stop_id || !stop.stop_lat || !stop.stop_lon) return;

      const masterNodeId = stop.parent_station || stop.stop_id;
      this.stopIdToParentIdMap.set(stop.stop_id, masterNodeId);

      if (!this.nodes[masterNodeId]) {
        this.nodes[masterNodeId] = {
          id: masterNodeId,
          name: stop.stop_name || "Unknown Station",
          lat: parseFloat(stop.stop_lat),
          lon: parseFloat(stop.stop_lon),
          stops: [],
        };
        this.adjacency[masterNodeId] = [];
      }
    });

    stopTimes.sort((a, b) => {
      if (a.trip_id !== b.trip_id) {
        return a.trip_id > b.trip_id ? 1 : -1;
      }
      return parseInt(a.stop_sequence) - parseInt(b.stop_sequence);
    });

    let edgesCount = 0;
    for (let i = 0; i < stopTimes.length - 1; i++) {
      const currentStop = stopTimes[i];
      const nextStop = stopTimes[i + 1];

      if (currentStop.trip_id === nextStop.trip_id) {
        const nodeAId = this.stopIdToParentIdMap.get(currentStop.stop_id);
        const nodeBId = this.stopIdToParentIdMap.get(nextStop.stop_id);

        if (!nodeAId || !nodeBId || nodeAId === nodeBId) continue;

        const nodeA = this.nodes[nodeAId];
        const nodeB = this.nodes[nodeBId];
        const trip = tripsMap.get(currentStop.trip_id);
        const route = routesMap.get(trip?.route_id);

        if (nodeA && nodeB && route) {
          this.#createTransportEdge(nodeA, nodeB, route, trip);
          edgesCount++;
        }
      }
    }
    console.log(`GraphBuilder: Added ${edgesCount} transport segments.`);
  }

  /**
   * Calcule le poids et crée l'arc entre deux stations physiques
   * @private
   */
  #createTransportEdge(nodeA, nodeB, route, trip) {
    const distanceMeters = this.geoCalculator.getDistance(
      nodeA.lat,
      nodeA.lon,
      nodeB.lat,
      nodeB.lon,
    );

    const isRail = route.route_type !== "3";
    const speedKmh = isRail ? this.#RAIL_SPEED_KMH : this.#BUS_SPEED_KMH;

    const durationSeconds =
      Math.round(distanceMeters / 1000 / (speedKmh / 3600)) +
      this.#STOP_PENALTY_SECONDS;

    const lineName = route?.route_short_name || route?.route_long_name;

    const transportTypeLabel = this.gtfsParser.getRouteTypeLabel(
      route?.route_type,
      lineName,
    );

    const existingEdge = this.adjacency[nodeA.id].find(
      (edge) => edge.node === nodeB.id && edge.line === lineName,
    );

    if (!existingEdge) {
      this.adjacency[nodeA.id].push({
        node: nodeB.id,
        weight: durationSeconds,
        type: transportTypeLabel,
        line: lineName,
        headsign: trip?.trip_headsign,
      });
    }
  }

  /**
   * Génère les correspondances à pied entre les stations proches géographiquement
   * @private
   */
  #generateWalkingTransfers() {
    console.log("GraphBuilder: Generating walking transfers...");

    const nodesArray = Object.values(this.nodes);

    const spatialIndex = new KDBush(nodesArray.length);
    for (const node of nodesArray) spatialIndex.add(node.lon, node.lat);
    spatialIndex.finish();

    let transferCount = 0;
    const maxTransferDistKm = 0.2;

    nodesArray.forEach((nodeA) => {
      const neighborIndices = geokdbush.around(
        spatialIndex,
        nodeA.lon,
        nodeA.lat,
        Infinity,
        maxTransferDistKm,
      );

      for (const idx of neighborIndices) {
        const nodeB = nodesArray[idx];
        if (nodeA.id === nodeB.id) continue;

        const distanceMeters = this.geoCalculator.getDistance(
          nodeA.lat,
          nodeA.lon,
          nodeB.lat,
          nodeB.lon,
        );

        const durationSeconds =
          Math.round(distanceMeters / this.#WALK_SPEED_MS) +
          this.#TRANSFER_PENALTY_SECONDS;

        this.adjacency[nodeA.id].push({
          node: nodeB.id,
          weight: durationSeconds,
          type: "WALK",
          line: "Correspondance",
          headsign: "Marche",
        });
        transferCount++;
      }
    });
    console.log(`GraphBuilder: Generated ${transferCount} walking transfers.`);
  }

  /**
   * Sérialise le graphe complet en JSON et l'écrit sur le disque
   * Le JSON est standard et lisible par le navigateur via fetch()
   * @param {string} outputPath - Chemin de destination (doit finir par .json)
   * @private
   */
  #saveGraphToDisk(outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const graphObject = {
      nodes: this.nodes,
      adjacency: this.adjacency,
    };

    // On transforme l'objet JS en chaîne JSON
    console.log("GraphBuilder: Serializing to JSON...");
    const jsonString = JSON.stringify(graphObject);

    fs.writeFileSync(outputPath, jsonString, "utf8");

    // Calcul de la taille du fichier généré
    const stats = fs.statSync(outputPath);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`GraphBuilder: Graph saved to ${outputPath} (${sizeMb} MB)`);
  }
}
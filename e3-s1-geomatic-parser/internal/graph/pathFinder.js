import fs from "fs";
import v8 from "v8";
import KDBush from "kdbush";
import * as geokdbush from "geokdbush";
import { MinHeap } from "../utils/minHeap.js";

/**
 * Moteur de recherche d'itinéraire multimodal basé sur l'algorithme A* (A-Star)
 * Gère le chargement du graphe binaire, la recherche spatiale des gares,
 * et le calcul de trajets selon différents profils (Vitesse, Confort, Bus, etc)
 *
 * @param {string} graphPath - Chemin vers le fichier du graphe (.bin)
 * @param {Object} geoCalculator - Instance pour les calculs de distance
 */
export class PathFinder {
  constructor(graphPath, geoCalculator) {
    this.graphPath = graphPath;
    this.geoCalculator = geoCalculator;
    this.graph = null;
    this.spatialIndex = null;
    this.nodePoints = null;
  }

  /**
   * Charge le graphe binaire en mémoire et construit l'index spatial
   * Cette méthode doit être appelée avant toute recherche
   * @returns {Promise<void>}
   */
  async loadGraph() {
    const buffer = fs.readFileSync(this.graphPath);
    this.graph = v8.deserialize(buffer);

    const nodeIds = Object.keys(this.graph.nodes);

    this.nodePoints = nodeIds.map((key) => {
      const n = this.graph.nodes[key];
      return { nodeId: key, lon: n.lon, lat: n.lat };
    });

    this.spatialIndex = new KDBush(this.nodePoints.length);
    for (const p of this.nodePoints) this.spatialIndex.add(p.lon, p.lat);
    this.spatialIndex.finish();
  }

  /**
   * Trouve le nœud de transport le plus proche d'une coordonnée GPS
   * Applique une logique de "Snapping Intelligent" pour privilégier les gares importantes (RER, Train)
   * si elles sont proches, plutôt qu'un arrêt de bus mineur
   *
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Object|null} L'objet { node, distance } ou null si rien trouvé
   */
  findNearestNode(lat, lon) {
    if (!this.spatialIndex)
      throw new Error("Graph not loaded. Call loadGraph() first.");

    const neighborIndices = geokdbush.around(
      this.spatialIndex,
      lon,
      lat,
      20,
      0.5,
    );

    if (neighborIndices.length === 0) return null;

    const candidates = neighborIndices.map((idx) => {
      const point = this.nodePoints[idx];
      const node = this.graph.nodes[point.nodeId];
      const dist = this.geoCalculator.getDistance(lat, lon, node.lat, node.lon);
      return { node, dist };
    });

    candidates.sort((a, b) => a.dist - b.dist);
    const priorityKeywords = ["RER", "GARE", "METRO", "TRAM", "TRAIN"];

    const vipCandidate = candidates.find((c) => {
      if (c.dist > 300) return false;
      const nameUpper = c.node.name.toUpperCase();
      return priorityKeywords.some((k) => nameUpper.includes(k));
    });

    return vipCandidate || candidates[0];
  }

  /**
   * Lance la recherche d'itinéraire pour plusieurs profils (Rapide, Confort, Bus...)
   * @param {string} startNodeId - ID du nœud de départ
   * @param {string} endNodeId - ID du nœud d'arrivée
   * @returns {Promise<Array<Object>>} Liste des itinéraires uniques triés par temps
   */
  async findMultiModalRoutes(startNodeId, endNodeId) {
    const profiles = [
      {
        id: "express",
        name: "Express (Tout permis)",
        options: { penalty: 600, allowedModes: null, nightMode: true },
      },
      {
        id: "comfort",
        name: "Confort (Peu de changements)",
        options: { penalty: 900, allowedModes: null, nightMode: false },
      },
      {
        id: "bus_only",
        name: "100% Bus",
        options: {
          penalty: 600,
          allowedModes: ["BUS", "WALK"],
          nightMode: false,
        },
      },
      {
        id: "rail_only",
        name: "100% Rail (RER/Métro/Tram)",
        options: {
          penalty: 1200,
          allowedModes: ["METRO", "RER", "TRAIN", "TRAM", "WALK"],
          nightMode: false,
        },
      },
    ];

    const promises = profiles.map(async (profile) => {
      const result = this.#executeAStar(
        startNodeId,
        endNodeId,
        profile.options,
      );
      return result ? { profile: profile.name, ...result } : null;
    });

    const rawResults = await Promise.all(promises);

    const uniqueRoutesMap = new Map();

    rawResults.forEach((res) => {
      if (!res) return;
      const signature = res.path.map((step) => step.line).join("|");

      if (
        !uniqueRoutesMap.has(signature) ||
        uniqueRoutesMap.get(signature).totalCost > res.totalCost
      ) {
        uniqueRoutesMap.set(signature, res);
      }
    });

    return Array.from(uniqueRoutesMap.values()).sort((a, b) => {
      const durationA = a.path.reduce((acc, s) => acc + s.duration, 0);
      const durationB = b.path.reduce((acc, s) => acc + s.duration, 0);
      return durationA - durationB;
    });
  }

  /**
   * Implémentation de l'algorithme A* (A-Star)
   * @param {string} startNodeId
   * @param {string} endNodeId
   * @param {Object} options - { penalty, allowedModes, nightMode }
   * @returns {Object|null} { path, totalCost }
   * @private
   */
  #executeAStar(startNodeId, endNodeId, options) {
    const endNode = this.graph.nodes[endNodeId];

    const frontier = new MinHeap();

    const costSoFar = new Map();

    const cameFrom = {};

    costSoFar.set(startNodeId, 0);

    frontier.push({ id: startNodeId, f: 0, arrivalLine: null });

    const allowedModesSet = options.allowedModes
      ? new Set(options.allowedModes)
      : null;
    const isNightMode = options.nightMode;

    const AVERAGE_WAIT_TIME_SECONDS = 180;

    while (!frontier.isEmpty()) {
      const current = frontier.pop();
      const currentId = current.id;

      if (currentId === endNodeId) {
        return {
          path: this.#reconstructPath(cameFrom, endNodeId),
          totalCost: costSoFar.get(endNodeId),
        };
      }

      if (current.f > (costSoFar.get(currentId) ?? Infinity) + 1200) continue;

      const neighbors = this.graph.adjacency[currentId] || [];
      const currentG = costSoFar.get(currentId);

      for (const edge of neighbors) {
        const neighborId = edge.node;

        if (allowedModesSet && !allowedModesSet.has(edge.type)) continue;

        const isNightLine =
          edge.line && edge.line.startsWith("N") && edge.line.length < 5;
        if (!isNightMode && isNightLine) continue;

        let edgeCost = edge.weight;
        let penaltyCost = 0;

        const isWalkingSegment =
          edge.type === "WALK" || edge.line === "Correspondance";

        if (!isWalkingSegment) {
          if (current.arrivalLine !== edge.line) {
            penaltyCost += options.penalty;

            penaltyCost += AVERAGE_WAIT_TIME_SECONDS;
          }
        }

        const tentativeG = currentG + edgeCost + penaltyCost;

        if (tentativeG < (costSoFar.get(neighborId) ?? Infinity)) {
          cameFrom[neighborId] = { prev: currentId, edgeDetails: edge };
          costSoFar.set(neighborId, tentativeG);

          const heuristicCost = this.#calculateHeuristic(neighborId, endNode);

          const nextArrivalLine = isWalkingSegment
            ? "Correspondance"
            : edge.line;

          frontier.push({
            id: neighborId,
            f: tentativeG + heuristicCost,
            arrivalLine: nextArrivalLine,
          });
        }
      }
    }
    return null;
  }

  /**
   * Fonction heuristique pour A* (Distance euclidienne / Vitesse Max)
   * @private
   */
  #calculateHeuristic(nodeId, endNode) {
    const node = this.graph.nodes[nodeId];
    return (
      this.geoCalculator.getDistance(
        node.lat,
        node.lon,
        endNode.lat,
        endNode.lon,
      ) / 30
    );
  }

  /**
   * Reconstruit le chemin final en remontant les pointeurs 'prev'
   * @private
   */
  #reconstructPath(cameFrom, endNodeId) {
    const path = [];
    let currentId = endNodeId;

    while (cameFrom[currentId]) {
      const step = cameFrom[currentId];
      const nodeInfo = this.graph.nodes[currentId];

      path.unshift({
        stop: nodeInfo.name,
        line: step.edgeDetails.line,
        type: step.edgeDetails.type,
        duration: step.edgeDetails.weight,
        headsign: step.edgeDetails.headsign,
      });

      currentId = step.prev;
    }

    const startNode = this.graph.nodes[currentId];
    path.unshift({
      stop: startNode ? startNode.name : "Départ",
      type: "DEPART",
      line: "",
      duration: 0,
    });

    return path;
  }
}

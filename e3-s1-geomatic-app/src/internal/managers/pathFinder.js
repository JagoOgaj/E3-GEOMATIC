import { CONFIG } from "../config/config.js";
import { MinHeap } from "../utils/minHeap.js";
import { getDist } from "../utils/pahFinder.js";

/**
 * Classe responsable du calcul d'itinéraires multimodaux.
 * Utilise un graphe de transport préchargé et l'algorithme A* pour déterminer
 * le chemin le plus court entre deux points géographiques.
 */
export class PathFinder {
  constructor() {
    this.graph = null;
    this.isReady = false;
  }

  /**
   * Initialise le Pathfinder en téléchargeant le fichier JSON du graphe de transport.
   * Cette méthode doit être appelée avant toute tentative de calcul d'itinéraire.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isReady) return;
    try {
      const res = await fetch(CONFIG.paths.graph);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      this.graph = await res.json();
      this.isReady = true;
    } catch (e) {
      // Gestion silencieuse de l'erreur
    }
  }

  /**
   * Calcule l'itinéraire optimal entre deux coordonnées géographiques.
   * Trouve les nœuds les plus proches, exécute l'algorithme A* et consolide les étapes.
   * @param {Object} startCoords - Coordonnées de départ {lat, lng}.
   * @param {Object} endCoords - Coordonnées d'arrivée {lat, lng}.
   * @returns {Object|null} Un objet contenant le chemin simplifié, le chemin brut et la durée totale, ou null si aucun chemin n'est trouvé.
   */
  findPath(startCoords, endCoords) {
    if (!this.isReady) return null;

    const startNode = this.#findNearest(startCoords.lat, startCoords.lng);
    const endNode = this.#findNearest(endCoords.lat, endCoords.lng);

    if (!startNode || !endNode) return null;

    const result = this.#runAStar(String(startNode.id), String(endNode.id));

    if (!result) return null;

    const consolidatedPath = this.#consolidatePath(result.path);

    return {
      path: consolidatedPath,
      rawPath: result.path,
      totalDuration: result.totalCost,
      startNode,
      endNode,
    };
  }

  /**
   * Méthode privée. Fusionne les étapes consécutives appartenant à la même ligne de transport
   * pour simplifier l'affichage final (ex: regrouper 10 arrêts de bus en un seul segment).
   * @param {Array<Object>} rawPath - Le chemin brut retourné par l'algorithme A*.
   * @returns {Array<Object>} Le chemin consolidé et lisible pour l'utilisateur.
   */
  #consolidatePath(rawPath) {
    if (!rawPath || rawPath.length === 0) return [];

    const steps = [];
    let currentStep = null;

    const nodesToProcess = [
      {
        type: "DEPART",
        line: "Départ",
        name: "Mon Position",
        lat: rawPath[0].lat,
        lon: rawPath[0].lon,
        duration: 0,
      },
      ...rawPath,
    ];

    for (const node of nodesToProcess) {
      if (node.type === "DEPART" && steps.length === 0) {
        currentStep = {
          type: "DEPART",
          line: "Départ",
          headsign: "",
          name: node.name,
          lat: node.lat,
          lon: node.lon,
          weight: 0,
          stopsCount: 0,
        };
        steps.push(currentStep);
        continue;
      }

      const isSameLine =
        currentStep &&
        node.line === currentStep.line &&
        node.type === currentStep.type;

      if (isSameLine) {
        currentStep.name = node.name;
        currentStep.lat = node.lat;
        currentStep.lon = node.lon;
        currentStep.weight += node.duration;
        currentStep.stopsCount++;

        if (!currentStep.headsign && node.headsign) {
          currentStep.headsign = node.headsign;
        }
      } else {
        if (currentStep && !currentStep.headsign) {
          if (
            currentStep.type === "WALK" ||
            currentStep.line === "Correspondance"
          ) {
            currentStep.headsign = currentStep.name;
          } else {
            currentStep.headsign = currentStep.name;
          }
        }

        currentStep = {
          type: node.type,
          line: node.line,
          headsign: node.headsign || "",
          name: node.name,
          lat: node.lat,
          lon: node.lon,
          weight: node.duration,
          stopsCount: 1,
        };
        steps.push(currentStep);
      }
    }

    return steps.map((step) => {
      if (step.line === "Correspondance" || step.type === "WALK") {
        return {
          ...step,
          type: "WALK",
          line: "Marche",
          headsign: step.headsign || step.name,
        };
      }
      if (!step.headsign || step.headsign === "undefined") {
        step.headsign = step.name;
      }
      return step;
    });
  }

  /**
   * Méthode privée. Trouve le nœud du graphe le plus proche des coordonnées géographiques données
   * dans un rayon défini.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @returns {Object|null} Le nœud le plus proche ou null si aucun nœud n'est trouvé dans la zone.
   */
  #findNearest(lat, lon) {
    let nearest = null;
    let minDst = Infinity;
    const box = 0.1;

    for (const id in this.graph.nodes) {
      const n = this.graph.nodes[id];
      if (
        n.lat < lat - box ||
        n.lat > lat + box ||
        n.lon < lon - box ||
        n.lon > lon + box
      )
        continue;

      const d = getDist(lat, lon, n.lat, n.lon);
      if (d < minDst) {
        minDst = d;
        nearest = n;
      }
    }
    return nearest;
  }

  /**
   * Méthode privée. Exécute l'algorithme A* (A-Star) pour trouver le chemin le plus court
   * entre deux nœuds du graphe.
   * @param {string} startId - Identifiant du nœud de départ.
   * @param {string} endId - Identifiant du nœud d'arrivée.
   * @returns {Object|null} Un objet contenant le chemin brut et le coût total, ou null si échec.
   */
  #runAStar(startId, endId) {
    if (!this.graph.nodes[startId] || !this.graph.nodes[endId]) return null;

    const endNode = this.graph.nodes[endId];
    const frontier = new MinHeap();
    const costSoFar = new Map();
    const cameFrom = {};

    costSoFar.set(startId, 0);
    frontier.push({ id: startId, f: 0, arrivalLine: null });

    let iterations = 0;
    const MAX_ITERATIONS = 50000;

    while (!frontier.isEmpty()) {
      const current = frontier.pop();
      iterations++;
      if (iterations > MAX_ITERATIONS) break;

      if (current.id === endId) return this.#reconstruct(cameFrom, endId);

      const neighbors = this.graph.adjacency[current.id] || [];
      const currentCost = costSoFar.get(current.id);

      for (const edge of neighbors) {
        let penalty = 0;
        if (
          current.arrivalLine &&
          edge.line !== "Correspondance" &&
          edge.line !== current.arrivalLine
        ) {
          penalty = 300;
        }

        const newCost = currentCost + edge.weight + penalty;

        if (newCost < (costSoFar.get(edge.node) ?? Infinity)) {
          costSoFar.set(edge.node, newCost);
          cameFrom[edge.node] = { prev: current.id, detail: edge };

          const neighborNode = this.graph.nodes[edge.node];
          const heuristic =
            getDist(
              neighborNode.lat,
              neighborNode.lon,
              endNode.lat,
              endNode.lon
            ) / 27;

          const nextLine =
            edge.line === "Correspondance" ? current.arrivalLine : edge.line;

          frontier.push({
            id: edge.node,
            f: newCost + heuristic,
            arrivalLine: nextLine,
          });
        }
      }
    }
    return null;
  }

  /**
   * Méthode privée. Reconstruit le chemin complet (liste des nœuds et détails de transition)
   * à partir de la carte des provenances générée par l'algorithme A*.
   * @param {Object} cameFrom - Carte associant chaque nœud à son prédécesseur.
   * @param {string} currentId - Identifiant du nœud final pour remonter la chaîne.
   * @returns {Object} Un objet contenant le tableau du chemin reconstruit et le coût total pondéré.
   */
  #reconstruct(cameFrom, currentId) {
    const path = [];
    let totalCost = 0;

    while (cameFrom[currentId]) {
      const step = cameFrom[currentId];
      const node = this.graph.nodes[currentId];

      path.unshift({
        lat: node.lat,
        lon: node.lon,
        name: node.name,
        line: step.detail.line,
        type: step.detail.type,
        duration: step.detail.weight,
        headsign: step.detail.headsign || step.detail.trip_headsign,
      });

      totalCost += step.detail.weight;
      currentId = step.prev;
    }

    return { path, totalCost };
  }
}

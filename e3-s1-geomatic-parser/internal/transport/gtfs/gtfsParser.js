import fs from "fs";
import path from "path";
import csv from "csv-parser";

export class GtfsParser {
  constructor(datasetPath, logFilePath, targets = []) {
    this.path = datasetPath;
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

  #log(msg) {
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, msg + "\n");
      } catch (e) {
        console.error(e);
      }
    }
  }

  #isTargetOfInterest(gtfsId, gtfsName) {
    if (!this.targets || this.targets.length === 0) return null;

    const gId = String(gtfsId);
    const gName = gtfsName ? gtfsName.toLowerCase() : "";

    for (const target of this.targets) {
      if (gId.includes(target.id) || target.id.includes(gId)) {
        return { target, reason: "🆔 ID" };
      }

      if (target.name.length > 3 && gName.includes(target.name)) {
        return { target, reason: "🏷️ NOM" };
      }
    }

    return null;
  }

  async parse() {
    await this.#loadStopsData();

    const routes = await this.#loadRoutes();

    const trips = await this.#loadTrips();

    await this.#scanStopTimes(routes, trips);

    this.#propagateInfo();

    return {
      modes: this.stopModes,
      lines: this.stopLines,
      mapping: this.idMapping,
    };
  }

  async #loadStopsData() {
    const file = path.join(this.path, "stops.txt");
    if (!fs.existsSync(file)) return;

    return new Promise((resolve) => {
      fs.createReadStream(file)
        .pipe(csv())
        .on("data", (row) => {
          const name = row.stop_name || "Inconnu";
          const id = row.stop_id;

          this.stopNames.set(id, name);

          if (row.parent_station) {
            this.parentMap.set(id, row.parent_station);
            if (!this.childrenMap.has(row.parent_station)) {
              this.childrenMap.set(row.parent_station, []);
            }
            this.childrenMap.get(row.parent_station).push(id);
          }
        })
        .on("end", () => resolve());
    });
  }

  async #loadRoutes() {
    const routes = new Map();
    const file = path.join(this.path, "routes.txt");
    if (!fs.existsSync(file)) return routes;

    return new Promise((resolve) => {
      fs.createReadStream(file)
        .pipe(csv())
        .on("data", (row) => {
          const type = parseInt(row.route_type, 10);
          let typeLabel = "Bus";

          if (type === 1 || (type >= 400 && type <= 404)) typeLabel = "Métro";
          else if (type === 0 || (type >= 900 && type <= 906))
            typeLabel = "Tram";
          else if (type === 2 || (type >= 100 && type < 200))
            typeLabel = "Train";
          else if (type === 4 || type === 1000) typeLabel = "Ferry";
          else if (type === 5 || type === 7 || type === 1400)
            typeLabel = "Funiculaire";

          const name = row.route_short_name || row.route_long_name || "Inconnu";
          routes.set(row.route_id, { type: typeLabel, name: name });
        })
        .on("end", () => resolve(routes));
    });
  }

  async #loadTrips() {
    const trips = new Map();
    const file = path.join(this.path, "trips.txt");
    if (!fs.existsSync(file)) return trips;
    return new Promise((resolve) => {
      fs.createReadStream(file)
        .pipe(csv())
        .on("data", (row) => {
          trips.set(row.trip_id, row.route_id);
        })
        .on("end", () => resolve(trips));
    });
  }

  async #scanStopTimes(routes, trips) {
    const file = path.join(this.path, "stop_times.txt");
    if (!fs.existsSync(file)) return;

    return new Promise((resolve) => {
      fs.createReadStream(file)
        .pipe(csv())
        .on("data", (row) => {
          const stopId = row.stop_id;
          const tripId = row.trip_id;
          const routeId = trips.get(tripId);

          if (routeId) {
            const routeInfo = routes.get(routeId);

            if (routeInfo && !this.loggedStops.has(stopId)) {
              const stopName = this.stopNames.get(stopId) || "Nom Inconnu";

              const result = this.#isTargetOfInterest(stopId, stopName);

              if (result) {
                const { target, reason } = result;

                this.#log(
                  `✅ [MATCH ${reason}] JSON: "${target.id}" <==> GTFS: "${stopId}" (${stopName}) -> ${routeInfo.type} (Ligne: ${routeInfo.name})`
                );
                this.loggedStops.add(stopId);

                if (!this.idMapping.has(target.id)) {
                  this.idMapping.set(target.id, new Set());
                }
                this.idMapping.get(target.id).add(stopId);
              }
            }

            if (routeInfo) {
              if (!this.stopModes.has(stopId))
                this.stopModes.set(stopId, new Set());
              this.stopModes.get(stopId).add(routeInfo.type);

              if (!this.stopLines.has(stopId))
                this.stopLines.set(stopId, new Set());
              this.stopLines.get(stopId).add(routeInfo.name);
            }
          }
        })
        .on("end", () => resolve());
    });
  }

  #propagateInfo() {
    for (const [childId, parentId] of this.parentMap.entries()) {
      if (this.stopModes.has(childId)) this.#mergeInfo(childId, parentId);
    }

    for (const [parentId, children] of this.childrenMap.entries()) {
      if (this.stopModes.has(parentId)) {
        for (const childId of children) this.#mergeInfo(parentId, childId);
      }
    }
  }

  #mergeInfo(sourceId, targetId) {
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
}

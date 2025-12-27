export class StopRepository {
  constructor(db) {
    this.db = db;
    this.grid = new Map();
    this.allStopsLoaded = false;
    this.GRID_SIZE = 0.01;
  }

  async init() {
    if (this.allStopsLoaded) return;

    const sql = `
      SELECT 
        stop_id as id, 
        stop_name as name,
        stop_lat as lat,
        stop_lon as lon,
        dataset_id,
        resource_id,
        dataset_datagouv_id,
        resource_datagouv_id,
        dataset_custom_title
      FROM transport_stops
      WHERE location_type IN (0, 1) OR location_type IS NULL
    `;

    const rows = await this.db.query(sql);

    for (const stop of rows) {
      const key = this.#getGridKey(stop.lat, stop.lon);
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(stop);
    }

    this.allStopsLoaded = true;
  }

  async findNearby(lat, lon, radiusMeters = 2000) {
    if (!this.allStopsLoaded) await this.init();

    const candidates = [];
    const latDeg = lat;
    const lonDeg = lon;

    const searchRange = Math.ceil(radiusMeters / 111000 / this.GRID_SIZE);

    const centerLatIndex = Math.floor(latDeg / this.GRID_SIZE);
    const centerLonIndex = Math.floor(lonDeg / this.GRID_SIZE);

    for (let x = -searchRange; x <= searchRange; x++) {
      for (let y = -searchRange; y <= searchRange; y++) {
        const key = `${centerLatIndex + x}_${centerLonIndex + y}`;
        const cellStops = this.grid.get(key);

        if (cellStops) {
          for (const stop of cellStops) {
            if (
              Math.abs(stop.lat - lat) < 0.05 &&
              Math.abs(stop.lon - lon) < 0.05
            ) {
              const dist = this.#getDistanceFromLatLonInM(
                lat,
                lon,
                stop.lat,
                stop.lon
              );
              if (dist <= radiusMeters) {
                candidates.push({ ...stop, distance_m: Math.round(dist) });
              }
            }
          }
        }
      }
    }

    return candidates.sort((a, b) => a.distance_m - b.distance_m);
  }

  #getGridKey(lat, lon) {
    return `${Math.floor(lat / this.GRID_SIZE)}_${Math.floor(
      lon / this.GRID_SIZE
    )}`;
  }

  #getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = this.#deg2rad(lat2 - lat1);
    const dLon = this.#deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.#deg2rad(lat1)) *
        Math.cos(this.#deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  #deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
}

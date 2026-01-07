/**
 * Repository gérant l'accès aux arrêts de transport.
 * Utilise une technique de "Spatial Hashing" (Grille en mémoire) pour effectuer
 * des recherches de proximité ultra-rapides sans solliciter la base de données à chaque requête.
 * 
 * @param {Object} db - Instance de connexion à la base de données (ex: DuckDB/Postgres).
 */
export class StopRepository {
  constructor(db) {
    this.db = db;
  
    this.grid = new Map();
    this.allStopsLoaded = false;
    
    this.GRID_SIZE = 0.01; 
  }

  /**
   * Charge tous les arrêts depuis la BDD et construit l'index spatial en mémoire.
   * Cette méthode est idempotente (ne fait rien si déjà chargé).
   * @returns {Promise<void>}
   */
  async init() {
    if (this.allStopsLoaded) return;

    console.log("Loading and indexing transport stops");
    const startTime = Date.now();

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
    console.log(`${rows.length} indexed stops in ${(Date.now() - startTime) / 1000}s.`);
  }

  /**
   * Trouve les arrêts dans un rayon donné autour d'un point.
   * @param {number} lat - Latitude du centre.
   * @param {number} lon - Longitude du centre.
   * @param {number} radiusMeters - Rayon de recherche en mètres (défaut: 2km).
   * @returns {Promise<Array<Object>>} Liste des arrêts triés par distance.
   */
  async findNearby(lat, lon, radiusMeters = 2000) {
    if (!this.allStopsLoaded) await this.init();

    const candidates = [];
    const searchRange = Math.ceil(radiusMeters / 111000 / this.GRID_SIZE);

    const centerLatIndex = Math.floor(lat / this.GRID_SIZE);
    const centerLonIndex = Math.floor(lon / this.GRID_SIZE);

    const maxDegreeDelta = (radiusMeters + 50) / 111000;

    for (let x = -searchRange; x <= searchRange; x++) {
      for (let y = -searchRange; y <= searchRange; y++) {
        const key = `${centerLatIndex + x}_${centerLonIndex + y}`;
        const cellStops = this.grid.get(key);

        if (cellStops) {
          for (const stop of cellStops) {
            if (
              Math.abs(stop.lat - lat) > maxDegreeDelta ||
              Math.abs(stop.lon - lon) > maxDegreeDelta
            ) {
              continue;
            }

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

    return candidates.sort((a, b) => a.distance_m - b.distance_m);
  }

  /**
   * Génère la clé de hachage spatial pour une coordonnée.
   * @param {number} lat 
   * @param {number} lon 
   * @returns {string} Clé sous forme "LatIdx_LonIdx"
   * @private
   */
  #getGridKey(lat, lon) {
    const latIdx = Math.floor(lat / this.GRID_SIZE);
    const lonIdx = Math.floor(lon / this.GRID_SIZE);
    return `${latIdx}_${lonIdx}`;
  }

  /**
   * Formule de Haversine pour calculer la distance entre deux points GPS.
   * @private
   */
  #getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R_EARTH = 6371000;
    const dLat = this.#deg2rad(lat2 - lat1);
    const dLon = this.#deg2rad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.#deg2rad(lat1)) *
      Math.cos(this.#deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R_EARTH * c;
  }

  /**
   * Convertit des degrés en radians.
   * @private
   */
  #deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
}
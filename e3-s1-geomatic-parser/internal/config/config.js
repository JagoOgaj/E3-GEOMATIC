import dotenv from "dotenv";
import path from "path";

/**
 * Gestionnaire de configuration de l'application (Singleton)
 * Centralise le chargement et l'accès aux variables d'environnement
 */
export class Config {
  /**
   * Instance unique de la classe Config
   * @type {Config}
   */
  static #instance;

  /**
   * Stockage interne des variables de configuration typées
   * @type {Record<string, string|number|boolean>}
   */
  #config = {};

  constructor() {
    if (Config.#instance) {
      return Config.#instance;
    }

    this.#loadEnvironment();
    Config.#instance = this;
  }

  /**
   * Charge les fichiers .env et parse les variables dans l'objet interne
   * @private
   */
  #loadEnvironment() {
    const defaultsEnvPath = path.resolve(process.cwd(), ".env.defaults");
    const envPath = path.resolve(process.cwd(), ".env");

    dotenv.config({ path: [defaultsEnvPath, envPath] });

    this.#config = {
      DB_PATH: process.env.DB_PATH,
      DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || "10", 10),
      DB_MEMORY_LIMIT: process.env.DB_MEMORY_LIMIT,
      DB_PRESERVE_INSERTION_ORDER:
        (process.env.DB_PRESERVE_INSERTION_ORDER || "").toLowerCase() ===
        "true",

      PATH_SOURCE_OFFERS_JSON: process.env.PATH_SOURCE_OFFERS_JSON,
      PATH_SOURCE_SIRENE: process.env.PATH_SOURCE_SIRENE,
      PATH_SOURCE_STOP_CSV: process.env.PATH_SOURCE_STOP_CSV,

      PATH_OUTPUT_COMPANIES_GEOJSON: process.env.PATH_OUTPUT_COMPANIES_GEOJSON,
      PATH_OUTPUT_OFFERS_BY_SIRET_JSON:
        process.env.PATH_OUTPUT_OFFERS_BY_SIRET_JSON,
      PATH_OUTPUT_STOP_BY_SIRET_JSON:
        process.env.PATH_OUTPUT_STOP_BY_SIRET_JSON,
      PATH_OUTPUT_TRANSPORT_STOP_JSON:
        process.env.PATH_OUTPUT_TRANSPORT_STOP_JSON,
      PATH_OUTPUT_REQUIRED_DATASETS: process.env.PATH_OUTPUT_REQUIRED_DATASETS,

      PATH_CACHE_GTFS: process.env.PATH_CACHE_GTFS,
      PATH_CACHE_GRAPHHOPPER: process.env.PATH_CACHE_GRAPHHOPPER,
      PATH_OUTPUT_GRAPH_BIN: process.env.PATH_OUTPUT_GRAPH_BIN,
    };
  }

  /**
   * Récupère une valeur de configuration par sa clé
   * @param {string} key - Le nom de la variable (ex: 'DB_PATH')
   * @returns {string|number|boolean} La valeur de configuration associée
   */
  get(key) {
    return this.#config[key];
  }
}

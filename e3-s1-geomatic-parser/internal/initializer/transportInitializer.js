import fs from "fs";

/**
 * Initialiseur de la base de données Transports (Arrêts/Stops) pour DuckDB
 * Charge les données depuis un CSV unifié (stops) et crée les index géospatiaux
 * Implémente le pattern Singleton
 *
 * @param {string} csvPath - Chemin absolu vers le fichier CSV des arrêts de transport
 */
export class TransportInitializer {
  static instance = null;

  constructor(csvPath) {
    if (TransportInitializer.instance) {
      return TransportInitializer.instance;
    }

    this.csvPath = csvPath;
    TransportInitializer.instance = this;
  }

  /**
   * Initialise la table 'transport_stops' et les index requis
   * @param {Object} db - L'instance de connexion DuckDB
   * @returns {Promise<void>}
   * @throws {Error} Si le fichier CSV est introuvable lors de la création de la table
   */
  async initialize(db) {
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'transport_stops'",
    );

    if (tables.length === 0) {
      await this.#importData(db);
    }

    await this.#createIndexes(db);
  }

  /**
   * Importe les données du CSV vers DuckDB
   * @param {Object} db - Connexion DuckDB
   * @private
   */
  async #importData(db) {
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(
        `Transport CSV file missing at: ${this.csvPath}. Cannot initialize database.`,
      );
    }

    await db.query(`
      CREATE TABLE transport_stops AS
      SELECT * FROM read_csv_auto('${this.csvPath}', normalize_names=true);
    `);
  }

  /**
   * Crée l'index géospatial composite pour optimiser les recherches par lat/lon
   * @param {Object} db - Connexion DuckDB
   * @private
   */
  async #createIndexes(db) {
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_transport_geo ON transport_stops(stop_lat, stop_lon)",
    );
  }
}

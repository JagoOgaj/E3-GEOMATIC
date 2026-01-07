import duckdb from "duckdb";

/**
 * Gestionnaire de pool de connexions pour DuckDB (Singleton)
 * Permet d'exécuter des requêtes SQL de manière concurrente grâce à un pool de workers
 *
 * @param {Object} config - L'instance de la configuration
 */
export class DbPool {
  /** @type {DbPool} Instance unique du singleton */
  static #instance;

  /** @type {Array<duckdb.Connection>} Liste des connexions actives */
  #connections = [];

  /** @type {number} Index */
  #index = 0;

  constructor(config) {
    if (DbPool.#instance) {
      return DbPool.#instance;
    }

    this.config = config;
    this.dbPath = config.get("DB_PATH");
    this.poolSize = config.get("DB_POOL_SIZE");

    this.db = null;

    DbPool.#instance = this;
  }

  /**
   * Initialise la base de données et ouvre le pool de connexions
   * Charge également l'extension spatiale et configure la mémoire
   * @returns {Promise<void>}
   */
  async initialize() {
    this.db = new duckdb.Database(this.dbPath);

    const memoryLimit = this.config.get("DB_MEMORY_LIMIT");
    const preserveOrder = this.config.get("DB_PRESERVE_INSERTION_ORDER");

    // Création séquentielle des connexions pour éviter de surcharger l'I/O au démarrage
    for (let i = 0; i < this.poolSize; i++) {
      const conn = this.db.connect();

      await new Promise((resolve, reject) => {
        conn.exec(
          `
          PRAGMA threads = 8;
          PRAGMA enable_object_cache = true;
          PRAGMA memory_limit = '${memoryLimit}';
          PRAGMA preserve_insertion_order = ${preserveOrder};
          INSTALL spatial;
          LOAD spatial;
          `,
          (err) => {
            if (err)
              return reject(
                new Error(`Failed to configure connection ${i}: ${err.message}`)
              );
            resolve();
          }
        );
      });

      this.#connections.push(conn);
    }
  }

  /**
   * Récupère la prochaine connexion disponible (Round-Robin)
   * @returns {duckdb.Connection} Une connexion active
   * @private
   */
  #getNextConnection() {
    if (this.#connections.length === 0) {
      throw new Error("DbPool not initialized. Call initialize() first.");
    }
    const conn = this.#connections[this.#index];
    this.#index = (this.#index + 1) % this.#connections.length;
    return conn;
  }

  /**
   * Exécute une requête SQL et retourne toutes les lignes
   * @param {string} sql - La requête SQL à exécuter
   * @param {Array<any>} [params=[]] - Les paramètres pour la requête préparée
   * @returns {Promise<Array<Object>>} Tableau contenant les résultats
   */
  query(sql, params = []) {
    const conn = this.#getNextConnection();

    return new Promise((resolve, reject) => {
      conn.all(sql, ...params, (err, rows) => {
        if (err) {
          reject(new Error(`SQL Error: ${err.message} | Query: ${sql}`));
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Ferme toutes les connexions et la base de données
   * Utile pour le nettoyage en fin de script
   * @returns {Promise<void>}
   */
  async close() {
    for (const conn of this.#connections) {
      try {
        conn.close();
      } catch (e) {
        /* ignore */
      }
    }
    this.#connections = [];

    if (this.db) {
      await new Promise((resolve) => this.db.close(resolve));
      this.db = null;
    }

    DbPool.#instance = null;
  }
}

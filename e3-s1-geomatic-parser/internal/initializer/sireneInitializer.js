import fs from "fs";

/**
 * Initialiseur de la base de données Sirene (DuckDB)
 * Gère la création de la table à partir d'un fichier Parquet et la création des index de performance
 * Implémente le pattern Singleton pour éviter les initialisations multiples
 * @param {string} parquetPath - Chemin absolu vers le fichier source sirene.parquet
 */
export class SireneInitializer {
  static instance = null;

  constructor(parquetPath) {
    if (SireneInitializer.instance) {
      return SireneInitializer.instance;
    }

    this.parquetPath = parquetPath;
    SireneInitializer.instance = this;
  }

  /**
   * Initialise la table et les index si nécessaire
   * @param {Object} db - L'instance de la connexion DuckDB
   * @returns {Promise<void>}
   * @throws {Error} Si le fichier Parquet source est manquant lors de la première initialisation
   */
  async initialize(db) {
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'sirene'",
    );

    if (tables.length === 0) {
      if (!fs.existsSync(this.parquetPath)) {
        throw new Error(
          `Sirene Parquet file missing at: ${this.parquetPath} Cannot initialize database`,
        );
      }

      console.log("Initializing Sirene table from Parquet file");

      await db.query(`
        CREATE TABLE sirene AS 
        SELECT * FROM '${this.parquetPath}';
      `);
    }

    await this.#createIndexes(db);
    console.log("Sirene database initialized successfully");
  }

  /**
   * Crée les index nécessaires pour optimiser les recherches
   * Utilise 'IF NOT EXISTS' pour éviter les erreurs si la base est déjà chaude
   * @param {Object} db - L'instance de connexion DuckDB
   * @private
   */
  async #createIndexes(db) {
    console.log("Verifying and creating indexes...");

    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_siret ON sirene(siret)",
      "CREATE INDEX IF NOT EXISTS idx_siren ON sirene(siren)",
      "CREATE INDEX IF NOT EXISTS idx_nic ON sirene(nic)",

      "CREATE INDEX IF NOT EXISTS idx_denomination_legale ON sirene(denominationunitelegale)",
      "CREATE INDEX IF NOT EXISTS idx_denomination_usuelle ON sirene(denominationusuelleetablissement)",

      "CREATE INDEX IF NOT EXISTS idx_codepostal ON sirene(codepostaletablissement)",
      "CREATE INDEX IF NOT EXISTS idx_commune ON sirene(libellecommuneetablissement)",

      "CREATE INDEX IF NOT EXISTS idx_tranche_effectif ON sirene(trancheeffectifsetablissementtriable)",
      "CREATE INDEX IF NOT EXISTS idx_activite ON sirene(activiteprincipaleetablissement)",
      "CREATE INDEX IF NOT EXISTS idx_siege ON sirene(etablissementsiege)",
    ];

    for (const indexQuery of indexes) {
      await db.query(indexQuery);
    }
  }
}

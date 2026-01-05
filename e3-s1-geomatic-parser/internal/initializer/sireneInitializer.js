import fs from "node:fs";

export class SireneInitializer {
  static instance = null;

  constructor(parquetPath) {
    if (SireneInitializer.instance) {
      return SireneInitializer.instance;
    }

    this.parquetPath = parquetPath;
    SireneInitializer.instance = this;
  }

  async initialize(db) {
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'sirene'"
    );

    if (tables.length == 0) { // Check if the 'sirene' table doesn't exist
      if (!fs.existsSync(this.parquetPath)) {
        console.error(
          `Sirene Parquet missing: ${this.parquetPath} - can't initialize`
        );
        return;
      }

      console.log("Initializing Sirene table from Parquet...");
      
      await db.query(`
        CREATE TABLE sirene AS 
          SELECT * FROM '${this.parquetPath}';
      `);

      console.log("Imported sirene parquet into the database successfully.");
    }

    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_sirene_zip ON sirene (codepostaletablissement)",

      "CREATE INDEX IF NOT EXISTS idx_sirene_siret ON sirene (siret)",

      "CREATE INDEX IF NOT EXISTS idx_sirene_name ON sirene (denominationunitelegale)",

      "CREATE INDEX IF NOT EXISTS idx_siret ON sirene(siret)",
      "CREATE INDEX IF NOT EXISTS idx_siren ON sirene(siren)",
      "CREATE INDEX IF NOT EXISTS idx_nic ON sirene(nic)",

      "CREATE INDEX IF NOT EXISTS idx_denominationusuelle ON sirene(denominationusuelleetablissement)",
      "CREATE INDEX IF NOT EXISTS idx_denominationunitelegale ON sirene(denominationunitelegale)",

      "CREATE INDEX IF NOT EXISTS idx_codepostal ON sirene(codepostaletablissement)",
      "CREATE INDEX IF NOT EXISTS idx_commune ON sirene(libellecommuneetablissement)",

      "CREATE INDEX IF NOT EXISTS idx_tranche_effectif ON sirene(trancheeffectifsetablissementtriable)",

      "CREATE INDEX IF NOT EXISTS idx_activite ON sirene(activiteprincipaleetablissement)",

      "CREATE INDEX IF NOT EXISTS idx_siege ON sirene(etablissementsiege)",
    ];

    console.log("Creating indexes...");
    for (const indexQuery of indexes) {
      const indexName = indexQuery.split(" ")[5];
      await db.query(indexQuery);
      console.log(`Index created (or already existing): ${indexName}`);
    }

    console.log("Sirene database initialized successfully!");
  }
}

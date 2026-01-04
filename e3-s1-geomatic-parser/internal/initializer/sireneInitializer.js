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
      "CREATE INDEX idx_sirene_zip ON sirene (codepostaletablissement)",

      "CREATE INDEX idx_sirene_siret ON sirene (siret)",

      "CREATE INDEX idx_sirene_name ON sirene (denominationunitelegale)",

      "CREATE INDEX idx_siret ON sirene(siret)",
      "CREATE INDEX idx_siren ON sirene(siren)",
      "CREATE INDEX idx_nic ON sirene(nic)",

      "CREATE INDEX idx_denominationusuelle ON sirene(denominationusuelleetablissement)",
      "CREATE INDEX idx_denominationunitelegale ON sirene(denominationunitelegale)",

      "CREATE INDEX idx_codepostal ON sirene(codepostaletablissement)",
      "CREATE INDEX idx_commune ON sirene(libellecommuneetablissement)",

      "CREATE INDEX idx_tranche_effectif ON sirene(trancheeffectifsetablissementtriable)",

      "CREATE INDEX idx_activite ON sirene(activiteprincipaleetablissement)",

      "CREATE INDEX idx_siege ON sirene(etablissementsiege)",
    ];

    console.log("Creating indexes...");
    for (const indexQuery of indexes) {
      const indexName = indexQuery.split(" ")[2];
      try {
        await db.query(indexQuery);
        console.log(`Index created: ${indexName}`);
      } catch (e) {
        console.warn(`Failed to create index ${indexName}, perhaps it already exists: ${e.message}`);
      }
    }

    console.log("Sirene database initialized successfully!");
  }
}

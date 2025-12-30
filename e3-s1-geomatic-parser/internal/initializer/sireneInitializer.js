import fs from "fs";

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
    // Check if the sirene table already exists
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'sirene'");
    if (tables.length == 0) {
      // Check if the parquet exists
      if (!fs.existsSync(this.parquetPath)) {
        console.error(`Sirene Parquet missing: ${this.parquetPath} - can't initialize`);
        return;
      }

      console.log("Initializing Sirene table from Parquet...");
      // Create table from parquet
      await db.query(`
        CREATE TABLE sirene AS 
          SELECT * FROM '${this.parquetPath}';
      `);

      console.log("Imported sirene parquet into the database successfully.");
    }

    // Create indexes to improve performance
    const indexes = [
      // Création d'index pour accélérer le filtrage par code postal (CRUCIAL)
      'CREATE INDEX idx_sirene_zip ON sirene (codepostaletablissement)',
      
      // Index pour les recherches par SIRET exact (CRUCIAL pour le niveau 1)
      'CREATE INDEX idx_sirene_siret ON sirene (siret)',
      
      // Si ta DB supporte, un index sur le nom peut aider (mais LIKE %...% l'ignore souvent)
      'CREATE INDEXidx_sirene_name ON sirene (denominationunitelegale)',
      
      // Index sur les identifiants uniques
      'CREATE INDEX idx_siret ON sirene(siret)',
      'CREATE INDEX idx_siren ON sirene(siren)',
      'CREATE INDEX idx_nic ON sirene(nic)',
      
      // Index sur le nom / raison sociale
      'CREATE INDEX idx_denominationusuelle ON sirene(denominationusuelleetablissement)',
      'CREATE INDEX idx_denominationunitelegale ON sirene(denominationunitelegale)',
      
      // Index géographique / localisation
      'CREATE INDEX idx_codepostal ON sirene(codepostaletablissement)',
      'CREATE INDEX idx_commune ON sirene(libellecommuneetablissement)',
      
      // Index sur la tranche d'effectif si tu veux filtrer par taille
      'CREATE INDEX idx_tranche_effectif ON sirene(trancheeffectifsetablissementtriable)',
      
      // Index sur l'activité
      'CREATE INDEX idx_activite ON sirene(activiteprincipaleetablissement)',
      
      // Index sur le siège
      'CREATE INDEX idx_siege ON sirene(etablissementsiege)'
    ];

    for (const indexQuery of indexes) {
      try {
        await db.query(indexQuery);
        console.log(`Index created: ${indexQuery.split(' ')[5]}`);
      } catch (e) {
        // Index already created
      }
    }

    console.log('Sirene database initialized succesfully!');
  }
}

import fs from "fs";

export class TransportInitializer {
  static instance = null;

  constructor(csvPath) {
    if (TransportInitializer.instance) {
      return TransportInitializer.instance;
    }

    this.csvPath = csvPath;
    TransportInitializer.instance = this;
  }

  async initialize(db) {
    // Check if the transport_stops table already exists
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'transport_stops'");
    if (tables.length == 0) {
      // Check if the CSV exists
      if (!fs.existsSync(this.csvPath)) {
        console.error(`Transport CSV missing: ${this.csvPath} - can't initialize`);
        return;
      }

      console.log("Creating transport_stops table from CSV...");
      
      // 1. Creation of the table (Corrected path)
      await db.query(`
        CREATE TABLE transport_stops AS
        SELECT * FROM read_csv_auto('${this.csvPath}', normalize_names=true);
      `);

      // 2. Verification (Should display a number > 0)
      try {
        const result = await db.query('SELECT count(*) as count FROM transport_stops');
        console.log(`Total records in transport_stops table: ${result[0].count}`);
      } catch (e) {
        console.error("Could not retrieve record count for transport_stops");
        return;
      }

      console.log("Transport stops imported successfully.");
    }

    // 3. Creation of the index (Essential for speed)
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_transport_geo ON transport_stops(stop_lat, stop_lon)');
      console.log("Created index: idx_transport_geo");
    } catch (e) {
      // Index already exists
    }

    console.log('Transport database initialized successfully!');
  }
}
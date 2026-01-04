import fs from "node:fs";

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
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'transport_stops'"
    );
    if (tables.length == 0) {
      if (!fs.existsSync(this.csvPath)) {
        console.error(
          `Transport CSV missing: ${this.csvPath} - can't initialize`
        );
        return;
      }

      console.log("Creating transport_stops table from CSV...");

      await db.query(`
        CREATE TABLE transport_stops AS
        SELECT * FROM read_csv_auto('${this.csvPath}', normalize_names=true);
      `);

      try {
        const result = await db.query(
          "SELECT count(*) as count FROM transport_stops"
        );
        console.log(
          `Total records in transport_stops table: ${result[0].count}`
        );
      } catch (e) {
        console.error(`Could not retrieve record count for transport_stops: ${err}`);
        return;
      }

      console.log("Transport stops imported successfully.");
    }

    try {
      await db.query(
        "CREATE INDEX IF NOT EXISTS idx_transport_geo ON transport_stops(stop_lat, stop_lon)"
      );
      console.log("Created index: idx_transport_geo");
    } catch (e) {}

    console.log("Transport database initialized successfully!");
  }
}

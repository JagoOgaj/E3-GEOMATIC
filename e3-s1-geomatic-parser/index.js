import { DatasetAggregator } from "./internal/aggregator/datasetAggregator.js";
import { Config } from "./internal/config/config.js";
import { DbPool } from "./internal/dbPool/dbPool.js";
import { GtfsDownloader } from "./internal/transport/gtfs/gtfsDownloader.js";

import { TransportFinalizer } from "./internal/transport/transportFinalizer.js";
import { TransportManager } from "./internal/transport/TransportManager.js";
import { Pipeline } from "./pipeline/pipeline.js";
import { OfferRepository } from "./repositories/offerRepository.js";
import { SireneRepository } from "./repositories/sireneRepository.js";
import { StopRepository } from "./repositories/stopRepository.js";
import { SireneInitializer } from "./internal/sireneInitializer.js";
import { TransportInitializer } from "./internal/transportInitializer.js";

async function main() {
  let db;

  try {
    const conf = new Config();

    db = new DbPool(conf.getEnvValue("DB_PATH"), 4);
    await db.init();

    // Initialize Sirene data if needed
    const sireneInitializer = new SireneInitializer(
      conf.getEnvValue("PATH_SOURCE_SIRENE")
    );
    await sireneInitializer.initialize(db);

    // Initialize transport data if needed
    const transportInitializer = new TransportInitializer(
      conf.getEnvValue("PATH_SOURCE_STOP_CSV")
    );
    await transportInitializer.initialize(db);

    const offerRepo = new OfferRepository(
      conf.getEnvValue("PATH_SOURCE_OFFERS_JSON")
    );
    const sireneRepo = new SireneRepository(db);
    const stopRepo = new StopRepository(db);

    const filePaths = {
      companies: conf.getEnvValue("PATH_OUTPUT_COMPANIES_GEOJSON"),
      offers: conf.getEnvValue("PATH_OUTPUT_OFFERS_BY_SIRET_JSON"),
      stationsRef: conf.getEnvValue("PATH_OUTPUT_TRANSPORT_STOP_JSON"),
      stationsLink: conf.getEnvValue("PATH_OUTPUT_STOP_BY_SIRET_JSON"),
      requiredDatasets: conf.getEnvValue("PATH_OUTPUT_REQUIRED_DATASETS"),
      gtfsTemp: conf.getEnvValue("PATH_CACHE_GTFS"),
    };

    const pipeline = new Pipeline(sireneRepo, offerRepo, stopRepo, filePaths);
    await pipeline.run();

    const aggregator = new DatasetAggregator(filePaths);
    await aggregator.run();

    const downloader = new GtfsDownloader(filePaths.gtfsTemp);
    const manager = new TransportManager(filePaths, downloader);
    const transportCache = await manager.loadTransportData();

    const finalizer = new TransportFinalizer(filePaths);
    await finalizer.run(transportCache);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

await main();

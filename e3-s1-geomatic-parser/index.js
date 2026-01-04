import { DatasetAggregator } from "./internal/aggregator/datasetAggregator.js";
import { Config } from "./internal/config/config.js";
import { DbPool } from "./internal/dbPool/dbPool.js";
import { GtfsDownloader } from "./internal/transport/gtfs/gtfsDownloader.js";

import { SireneInitializer } from "./internal/initializer/sireneInitializer.js";
import { TransportInitializer } from "./internal/initializer/transportInitializer.js";
import { TransportFinalizer } from "./internal/transport/transportFinalizer.js";
import { TransportManager } from "./internal/transport/transportManager.js";
import { Pipeline } from "./pipeline/pipeline.js";
import { OfferRepository } from "./repositories/offerRepository.js";
import { SireneRepository } from "./repositories/sireneRepository.js";
import { StopRepository } from "./repositories/stopRepository.js";

async function main() {
  let db;

  try {
    const conf = new Config();

    db = new DbPool(conf);
    await db.init();

    const env = {
      companies: conf.getEnvValue("PATH_OUTPUT_COMPANIES_GEOJSON"),
      offers: conf.getEnvValue("PATH_OUTPUT_OFFERS_BY_SIRET_JSON"),
      stationsRef: conf.getEnvValue("PATH_OUTPUT_TRANSPORT_STOP_JSON"),
      stationsLink: conf.getEnvValue("PATH_OUTPUT_STOP_BY_SIRET_JSON"),
      requiredDatasets: conf.getEnvValue("PATH_OUTPUT_REQUIRED_DATASETS"),
      gtfsTemp: conf.getEnvValue("PATH_CACHE_GTFS"),
      stopCsvPathFile: conf.getEnvValue("PATH_SOURCE_STOP_CSV"),
      sirenePathFile: conf.getEnvValue("PATH_SOURCE_SIRENE"),
      offersJsonPath: conf.getEnvValue("PATH_SOURCE_OFFERS_JSON"),
    };

    // Initialize Sirene data if needed
    const sireneInitializer = new SireneInitializer(env.sirenePathFile);
    await sireneInitializer.initialize(db);

    // Initialize transport data if needed
    const transportInitializer = new TransportInitializer(env.stopCsvPathFile);
    await transportInitializer.initialize(db);

    const offerRepo = new OfferRepository(env.offersJsonPath);
    const sireneRepo = new SireneRepository(db);
    const stopRepo = new StopRepository(db);

    const pipeline = new Pipeline(sireneRepo, offerRepo, stopRepo, env);
    await pipeline.run();

    const aggregator = new DatasetAggregator(env);
    await aggregator.run();

    const downloader = new GtfsDownloader(env.gtfsTemp);
    const manager = new TransportManager(env, downloader);
    const transportCache = await manager.loadTransportData();

    const finalizer = new TransportFinalizer(env);
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

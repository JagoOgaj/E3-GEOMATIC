import { Config } from "./internal/config/config.js";
import { DbPool } from "./internal/dbPool/dbPool.js";

import { OfferRepository } from "./repositories/offerRepository.js";
import { SireneRepository } from "./repositories/sireneRepository.js";
import { StopRepository } from "./repositories/stopRepository.js";

import { SireneInitializer } from "./internal/initializer/sireneInitializer.js";
import { TransportInitializer } from "./internal/initializer/transportInitializer.js";

import { Pipeline } from "./pipeline/pipeline.js";
import { DatasetAggregator } from "./internal/aggregator/datasetAggregator.js";

import { GtfsDownloader } from "./internal/transport/gtfs/gtfsDownloader.js";
import { TransportManager } from "./internal/transport/transportManager.js";
import { TransportFinalizer } from "./internal/transport/transportFinalizer.js";
import { GraphBuilder } from "./internal/graph/graphBuilder.js";
import { GeoCalculator } from "./internal/graph/geoCalculator.js";
import { GtfsParser } from "./internal/transport/gtfs/gtfsParser.js";

import { DATASET_URL } from "./const/graph.const.js";

/**
 * Point d'entrée principal de l'application.
 * Orchestre le flux de données : DB -> Pipeline -> Aggregation -> Graph.
 */
async function main() {
  console.log("Starting Application");

  const config = new Config();
  const db = new DbPool(config);
  const paths = resolvePaths(config);

  try {
    await db.initialize();

    console.time("Phase 1: DB Initialization");
    await Promise.all([
      new SireneInitializer(paths.sirenePathFile).initialize(db),
      new TransportInitializer(paths.stopCsvPathFile).initialize(db),
    ]);
    console.timeEnd("Phase 1: DB Initialization");

    console.time("Phase 2: Pipeline & Aggregation");
    const repositories = {
      offer: new OfferRepository(paths.offersJsonPath),
      sirene: new SireneRepository(db),
      stop: new StopRepository(db),
    };

    const pipeline = new Pipeline(
      repositories.sirene,
      repositories.offer,
      repositories.stop,
      paths,
    );
    await pipeline.run();

    const aggregator = new DatasetAggregator(paths);
    await aggregator.process();
    console.timeEnd("Phase 2: Pipeline & Aggregation");

    console.time("Phase 3: Transport Processing");
    const downloader = new GtfsDownloader(paths.gtfsTemp);

    downloader.clearBaseDir();

    const manager = new TransportManager(paths, downloader);
    const transportCache = await manager.loadTransportData();

    const finalizer = new TransportFinalizer(paths);
    await finalizer.run(transportCache);
    console.timeEnd("Phase 3: Transport Processing");

    console.time("Phase 4: Graph Building");

    downloader.clearBaseDir();

    console.log("Downloading Graph datasets");
    const datasetPaths = await downloader.downloadList(DATASET_URL);

    const builder = new GraphBuilder(new GtfsParser(), new GeoCalculator());
    await builder.build(datasetPaths, paths.outputGraphFile);

    console.timeEnd("Phase 4: Graph Building");

    console.log("\nAll operations completed successfully.");
  } catch (error) {
    console.error("\nFATAL ERROR:", error);
    process.exitCode = 1;
  } finally {
    if (db) {
      console.log("Closing database connection...");
      await db.close();
    }
  }
}

/**
 * Mappe la configuration vers un objet de chemins structuré.
 * @param {Config} conf
 */
function resolvePaths(conf) {
  return {
    sirenePathFile: conf.get("PATH_SOURCE_SIRENE"),
    stopCsvPathFile: conf.get("PATH_SOURCE_STOP_CSV"),
    offersJsonPath: conf.get("PATH_SOURCE_OFFERS_JSON"),

    companies: conf.get("PATH_OUTPUT_COMPANIES_GEOJSON"),
    offers: conf.get("PATH_OUTPUT_OFFERS_BY_SIRET_JSON"),
    stationsRef: conf.get("PATH_OUTPUT_TRANSPORT_STOP_JSON"),
    stationsLink: conf.get("PATH_OUTPUT_STOP_BY_SIRET_JSON"),
    requiredDatasets: conf.get("PATH_OUTPUT_REQUIRED_DATASETS"),

    gtfsTemp: conf.get("PATH_CACHE_GTFS"),
    outputGraphFile: conf.get("PATH_OUTPUT_GRAPH_JSON"),
  };
}

await main();

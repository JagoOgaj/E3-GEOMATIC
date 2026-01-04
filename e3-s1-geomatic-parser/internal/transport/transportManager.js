import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { GtfsParser } from "./gtfs/gtfsParser.js";

export class TransportManager {
  constructor(config, downloader) {
    this.paths = config;
    this.downloader = downloader;
    this.cache = new Map();
    this.debugLogPath = "./dataset/output/debug_gtfs_trace.txt";
  }

  async loadTransportData() {
    const stationsRef = JSON.parse(
      await fs.readFile(this.paths.stationsRef, "utf-8")
    );
    const requiredDatasets = JSON.parse(
      await fs.readFile(this.paths.requiredDatasets, "utf-8")
    );

    writeFileSync(
      this.debugLogPath,
      `=== DEBUG CIBLÉ (MAPPING FIX) : ${new Date().toISOString()} ===\n`
    );

    const CONCURRENCY_LIMIT = 5;

    const processDataset = async (ds, _) => {
      const targetStations = Object.entries(stationsRef)
        .filter(([key, val]) => val.dataset_id === ds.dataset_id)
        .map(([key, val]) => ({
          id: String(val.original_id || key),
          name: val.name ? val.name.toLowerCase() : "",
        }));

      if (targetStations.length === 0) return;

      try {
        const folderPath = await this.downloader.download(
          ds.dataset_id,
          ds.resource_id
        );

        if (folderPath) {
          this.#appendToLog(
            `\n DATASET ${ds.dataset_id} : ${targetStations.length} stations.`
          );

          const parser = new GtfsParser(
            folderPath,
            this.debugLogPath,
            targetStations
          );
          const result = await parser.parse();

          if (result.mapping) {
            for (const [userTargetId, gtfsIds] of result.mapping) {
              const uniqueKey = `${ds.dataset_id}:${userTargetId}`;

              const aggregatedModes = new Set();
              const aggregatedLines = new Set();

              for (const gtfsId of gtfsIds) {
                const modesFound = result.modes.get(gtfsId);
                const linesFound = result.lines.get(gtfsId);

                if (modesFound)
                  modesFound.forEach((m) => aggregatedModes.add(m));
                if (linesFound)
                  linesFound.forEach((l) => aggregatedLines.add(l));
              }

              if (aggregatedModes.size > 0) {
                this.cache.set(uniqueKey, {
                  modes: Array.from(aggregatedModes),
                  lines: Array.from(aggregatedLines),
                });
              }
            }
          }
        }
      } catch (err) {
        this.#appendToLog(`ERREUR Dataset ${ds.dataset_id}: ${err.message}`);
        console.error(`${ds.dataset_id}:`, err.message);
      }
    };

    await this.#runWithConcurrency(
      requiredDatasets,
      processDataset,
      CONCURRENCY_LIMIT
    );
    return this.cache;
  }

  async #runWithConcurrency(items, fn, limit) {
    const results = [];
    const executing = [];
    let index = 0;
    for (const item of items) {
      const p = fn(item, index++).then((r) => [p, r]);
      results.push(p);
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
  }

  #appendToLog(msg) {
    try {
      writeFileSync(this.debugLogPath, msg + "\n", { flag: "a" });
    } catch (e) {
      console.error(e);
    }
  }
}

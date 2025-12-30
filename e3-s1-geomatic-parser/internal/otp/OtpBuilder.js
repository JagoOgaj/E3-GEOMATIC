import { spawn } from "child_process";
import fs, { createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";

export class OtpBuilder {
  constructor(config, db) {
    this.regions = config.regions;
    this.baseDir = path.resolve(config.baseDir);
    this.otpJarPath = path.resolve(config.jarPath);
    this.memoryLimit = config.memory;

    this.db = db;
  }

  async run() {
    console.log("Starting processing of regions");

    for (const [regionId, regionConfig] of Object.entries(this.regions)) {
      await this.processRegion(regionId, regionConfig);
    }

    console.log("\nDone");
  }

  async processRegion(regionId, config) {
    const regionDir = path.join(this.baseDir, regionId);
    if (!fs.existsSync(regionDir)) fs.mkdirSync(regionDir, { recursive: true });

    try {
      for (const url of config.pbfUrls) {
        await this.downloadFile(url, regionDir, "OSM");
      }

      const datasets = await this.getGtfsLinksFromDb(config.bbox);

      for (const ds of datasets) {
        const url = `https://transport.data.gouv.fr/resources/${ds.resource_id}/download`;
        await this.downloadFile(
          url,
          regionDir,
          "GTFS",
          `gtfs_${ds.resource_id}.zip`
        );
      }

      await this.buildGraph(regionId, regionDir);
    } catch (err) {
      console.error(`${config.name} :`, err);
    }
  }

  buildGraph(regionId, dir) {
    return new Promise((resolve, reject) => {
      const graphFile = path.join(dir, "graph.obj");
      if (fs.existsSync(graphFile)) {
        return resolve();
      }

      const args = [
        `-Xmx${this.memoryLimit}`,
        "-jar",
        this.otpJarPath,
        "--build",
        dir,
        "--save",
      ];

      const child = spawn("java", args);

      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (
          line.includes("Reading") ||
          line.includes("Graph") ||
          line.includes("error")
        ) {
          console.log(`[JAVA] ${line.substring(0, 100)}`);
        }
      });

      child.stderr.on("data", (data) => console.error(`   [JAVA ERR] ${data}`));

      child.on("close", (code) => {
        if (code === 0) {
          console.log(`Graph built successfully for ${regionId} !`);
          resolve();
        } else {
          reject(new Error(`Java stopped with code ${code}`));
        }
      });
    });
  }

  async getGtfsLinksFromDb(bbox) {
    const query = `
        SELECT DISTINCT resource_id 
        FROM stops 
        WHERE stop_lat BETWEEN ? AND ?
          AND stop_lon BETWEEN ? AND ?
      `;

    return await this.db.query(query, [
      bbox.minLat,
      bbox.maxLat,
      bbox.minLon,
      bbox.maxLon,
    ]);
  }

  async downloadFile(url, targetDir, type, customName = null) {
    const filename = customName || path.basename(url);
    const targetPath = path.join(targetDir, filename);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
      return;
    }

    console.log(`DL ${type}: ${filename}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    await pipeline(response.body, createWriteStream(targetPath));
  }
}

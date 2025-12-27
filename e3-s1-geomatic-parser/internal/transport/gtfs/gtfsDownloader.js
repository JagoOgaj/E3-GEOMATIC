import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

export class GtfsDownloader {
  constructor(baseDir) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async download(datasetId, resourceId) {
    const targetDir = path.join(this.baseDir, String(datasetId));

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      return targetDir;
    }

    const url = `https://transport.data.gouv.fr/resources/${resourceId}/download`;
    const tempZipPath = path.join(this.baseDir, `temp_${datasetId}.zip`);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

      await pipeline(response.body, createWriteStream(tempZipPath));

      const zip = new AdmZip(tempZipPath);
      zip.extractAllTo(targetDir, true);

      return targetDir;
    } catch (error) {
      console.error(error.message);
      return null;
    } finally {
      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    }
  }
}

import fs from "node:fs";
import path from "node:path";
import StreamZip from "node-stream-zip";
import { pipeline } from "node:stream/promises";

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

      await pipeline(response.body, fs.createWriteStream(tempZipPath));

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const zip = new StreamZip.async({ file: tempZipPath });

      await zip.extract(null, targetDir);

      await zip.close();

      return targetDir;
    } catch (error) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      return null;
    } finally {
      if (fs.existsSync(tempZipPath)) {
        try {
          fs.unlinkSync(tempZipPath);
        } catch (e) {}
      }
    }
  }
}

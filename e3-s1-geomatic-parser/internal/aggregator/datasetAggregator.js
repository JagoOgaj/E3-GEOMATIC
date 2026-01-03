import fs from "fs/promises";

export class DatasetAggregator {
  constructor(filePaths) {
    this.paths = {
      stationsRef: filePaths.stationsRef,
      stationsLink: filePaths.stationsLink,
      requiredDatasets: filePaths.requiredDatasets,
    };
  }

  async run() {
    try {
      const stationsData = JSON.parse(
        await fs.readFile(this.paths.stationsRef, "utf-8")
      );
      const linksData = JSON.parse(
        await fs.readFile(this.paths.stationsLink, "utf-8")
      );

      const distinctDatasets = new Map();
      let stationCount = 0;
      let missingStationCount = 0;

      for (const data of Object.values(linksData)) {
        if (!data.stations) continue;

        for (const stationLink of data.stations) {
          const stationInfo = stationsData[stationLink.id];

          if (stationInfo) {
            const resourceId = stationInfo.resource_datagouv_id;

            if (resourceId && !distinctDatasets.has(resourceId)) {
              distinctDatasets.set(resourceId, {
                dataset_id: stationInfo.dataset_id,
                resource_id: stationInfo.resource_id,
                dataset_datagouv_id: stationInfo.dataset_datagouv_id,
                resource_datagouv_id: stationInfo.resource_datagouv_id,
                dataset_source_name: stationInfo.dataset_source_name,
                dataset_custom_title:
                  stationInfo.dataset_custom_title ||
                  stationInfo.dataset_source_name,
              });
            }
            stationCount++;
          } else {
            missingStationCount++;
          }
        }
      }

      const results = Array.from(distinctDatasets.values());
      await fs.writeFile(
        this.paths.requiredDatasets,
        JSON.stringify(results, null, 2)
      );

      return results;
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }
}

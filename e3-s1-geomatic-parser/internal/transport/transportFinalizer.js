import fs from "node:fs/promises";

export class TransportFinalizer {
  constructor(paths) {
    this.paths = paths;

    this.MAX_WALK_DISTANCE_KM = 1.7;
    this.SCORES = {
      TRAIN: 5,
      TRAM: 3,
      BUS: 1.5,
    };
  }

  async run(transportCache) {
    const stationsRef = JSON.parse(
      await fs.readFile(this.paths.stationsRef, "utf-8")
    );
    const linksData = JSON.parse(
      await fs.readFile(this.paths.stationsLink, "utf-8")
    );
    const geojsonData = JSON.parse(
      await fs.readFile(this.paths.companies, "utf-8")
    );

    let updatedStations = 0;

    for (const [_, data] of Object.entries(linksData)) {
      if (!data.stations || data.stations.length === 0) {
        data._final_score = 0;
        data._summary_modes = [];
        continue;
      }

      const companyModes = new Set();
      let bestStationScore = 0;

      data.stations.forEach((stationLink) => {
        const refStation = stationsRef[stationLink.id];
        let modes = ["Bus"];

        if (refStation) {
          const transportInfo = this.#findInCache(
            transportCache,
            refStation.dataset_id,
            stationLink.id
          );

          if (transportInfo) {
            modes = transportInfo.modes;
            stationLink.modes = modes;
            stationLink.lines = transportInfo.lines;
            updatedStations++;
          }
        }

        modes.forEach((m) => companyModes.add(m));

        const score = this.#calculateIndividualScore(
          modes,
          stationLink.distance
        );

        if (score > bestStationScore) {
          bestStationScore = score;
        }
      });

      data._summary_modes = Array.from(companyModes);
      data._final_score = parseFloat(bestStationScore.toFixed(2));
    }

    geojsonData.features.forEach((feature) => {
      const linkData =
        linksData[feature.id] || linksData[feature.properties.siret];
      if (linkData) {
        feature.properties.transport_modes = linkData._summary_modes || [];
        feature.properties.transport_score = linkData._final_score || 0;
      }
    });

    for (const data of Object.values(linksData)) {
      delete data._summary_modes;
      delete data._final_score;
    }

    await fs.writeFile(
      this.paths.stationsLink,
      JSON.stringify(linksData, null, 2)
    );
    await fs.writeFile(
      this.paths.companies,
      JSON.stringify(geojsonData, null, 2)
    );
  }

  #calculateIndividualScore(modes, distanceMeters) {
    const distanceKm = distanceMeters / 1000;

    if (distanceKm > this.MAX_WALK_DISTANCE_KM) return 0;

    let baseScore = this.SCORES.BUS;
    if (modes.some((m) => ["Train", "Métro", "Metro", "RER"].includes(m)))
      baseScore = this.SCORES.TRAIN;
    else if (modes.some((m) => ["Tram", "Tramway"].includes(m)))
      baseScore = this.SCORES.TRAM;

    const decayFactor = 1 - distanceKm / this.MAX_WALK_DISTANCE_KM;

    return baseScore * decayFactor;
  }

  #findInCache(cache, datasetId, stationId) {
    const key = `${datasetId}:${stationId}`;
    return cache.get(key) || null;
  }
}

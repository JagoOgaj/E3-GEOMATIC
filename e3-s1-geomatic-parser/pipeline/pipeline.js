import fs from "node:fs";
import pLimit from "p-limit";

export class Pipeline {
  constructor(sireneRepo, offerRepo, stopRepo, filePaths) {
    this.sireneRepo = sireneRepo;
    this.offerRepo = offerRepo;
    this.stopRepo = stopRepo;

    this.companiesMap = new Map();
    this.offersMap = new Map();
    this.stationsBySiret = new Map();
    this.globalStationsMap = new Map();

    this.limit = pLimit(20);

    this.buffer = [];
    this.BUFFER_SIZE = 100;

    this.SEARCH_RADIUS = 2000;

    this.paths = {
      companies: filePaths.companies,
      offers: filePaths.offers,
      stationsRef: filePaths.stationsRef,
      stationsLink: filePaths.stationsLink,
    };

    this.processedCount = 0;
    this.startTime = Date.now();
  }

  async run() {
    await this.stopRepo.init();

    await this.offerRepo.readAllOffers(async (rawOffer) => {
      this.buffer.push(rawOffer);

      if (this.buffer.length >= this.BUFFER_SIZE) {
        await this.#processBatch([...this.buffer]);
        this.buffer = [];
      }
    });

    if (this.buffer.length > 0) {
      await this.#processBatch([...this.buffer]);
      this.buffer = [];
    }
    this.#saveFiles();

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
  }

  async #processBatch(batch) {
    try {
      const enrichedOffers = await this.sireneRepo.enrichCompanies(batch);

      const tasks = enrichedOffers.map((offer) => {
        return this.limit(() => this.#processFinalizeOffer(offer));
      });

      await Promise.all(tasks);

      this.processedCount += batch.length;
      this.#logProgress();
    } catch (error) {
      console.error(error);
    }
  }

  async #processFinalizeOffer(enrichedOffer) {
    if (!enrichedOffer) return;

    if (!enrichedOffer.workplaceLat || !enrichedOffer.workplaceLon) return;

    const rawSiret = enrichedOffer.siret;
    let storageId;
    let isVirtual = false;

    const latKey = enrichedOffer.workplaceLat.toFixed(4);
    const lonKey = enrichedOffer.workplaceLon.toFixed(4);

    if (rawSiret) {
      storageId = `${rawSiret}_${latKey}_${lonKey}`;
    } else {
      const uniqueKey = `${
        enrichedOffer.companyName || "Inconnu"
      }_${latKey}_${lonKey}`;
      const hash = Buffer.from(uniqueKey)
        .toString("base64")
        .replaceAll("=", "") // Same: .replace(/=/g, "")
        .replaceAll("/", "_"); // Same: .replace(/\//g, "_");
      storageId = `VIRTUAL_${hash}`;
      isVirtual = true;
    }

    try {
      if (!this.companiesMap.has(storageId)) {
        const nearbyStations = await this.stopRepo.findNearby(
          enrichedOffer.workplaceLat,
          enrichedOffer.workplaceLon,
          this.SEARCH_RADIUS
        );

        const bestStations = nearbyStations.slice(0, 10);

        bestStations.forEach((station) => {
          if (!this.globalStationsMap.has(station.id)) {
            this.globalStationsMap.set(station.id, {
              name: station.name,
              lat: station.lat,
              lon: station.lon,
              dataset_source_name: station.dataset_custom_title,
              dataset_id: station.dataset_id,
              resource_id: station.resource_id,
              dataset_datagouv_id: station.dataset_datagouv_id,
              resource_datagouv_id: station.resource_datagouv_id,
            });
          }
        });

        const simplifiedStations = bestStations.map((s) => ({
          id: s.id,
          distance: s.distance_m,
        }));

        this.stationsBySiret.set(storageId, {
          radius: this.SEARCH_RADIUS,
          stations: simplifiedStations,
        });

        this.companiesMap.set(storageId, {
          type: "Feature",
          id: storageId,
          geometry: {
            type: "Point",
            coordinates: [
              enrichedOffer.workplaceLon,
              enrichedOffer.workplaceLat,
            ],
          },
          properties: {
            siret: rawSiret || "NON_RENSEIGNE",
            storage_id: storageId,
            company: enrichedOffer.companyName || "Entreprise Inconnue",
            sector: enrichedOffer.workplaceSector || {
              naf: "NC",
              label: "Non renseigné",
            },
            size: enrichedOffer.workplaceSize || "Non renseigné",
            is_virtual: isVirtual,
            transport_score: 0,
            isPublic: enrichedOffer.isPublic || false,
            stations_count: bestStations.length,
            offers_count: 0,
          },
        });
      }

      if (!this.offersMap.has(storageId)) {
        this.offersMap.set(storageId, []);
      }

      this.offersMap.get(storageId).push({
        offerId: enrichedOffer.offerId,
        title: enrichedOffer.offerName || enrichedOffer.title,
        contractType: enrichedOffer.contractType,
        offerDescription:
          enrichedOffer.offerDescription || enrichedOffer.description,
        applyUrl: enrichedOffer.applyUrl,
        targetDiploma: enrichedOffer.targetDiploma,
        contractDuration: enrichedOffer.contractDuration,
        contractStart: enrichedOffer.contractStart,
        accessConditions: enrichedOffer.accessConditions,
        desiredSkills: enrichedOffer.desiredSkills,
      });

      const companyFeature = this.companiesMap.get(storageId);
      if (companyFeature) {
        companyFeature.properties.offers_count++;
      }
    } catch (err) {
      console.error(err);
    }
  }

  #logProgress() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const speed =
      elapsedSeconds > 0 ? Math.round(this.processedCount / elapsedSeconds) : 0;
    process.stdout.write(
      `\r${this.processedCount} offres | Boites: ${this.companiesMap.size} | ${speed} offres/s `
    );
  }

  #jsonReplacer(key, value) {
    if (typeof value === "bigint") {
      return Number(value);
    }
    return value;
  }

  #saveFiles() {
    for (const [siret, feature] of this.companiesMap) {
      feature.properties.offers_count = this.offersMap.get(siret)?.length || 0;
    }

    fs.writeFileSync(
      this.paths.offers,
      JSON.stringify(Object.fromEntries(this.offersMap), this.#jsonReplacer, 2)
    );

    const geoJson = {
      type: "FeatureCollection",
      features: Array.from(this.companiesMap.values()),
    };
    fs.writeFileSync(
      this.paths.companies,
      JSON.stringify(geoJson, this.#jsonReplacer, 2)
    );

    fs.writeFileSync(
      this.paths.stationsRef,
      JSON.stringify(
        Object.fromEntries(this.globalStationsMap),
        this.#jsonReplacer,
        2
      )
    );

    fs.writeFileSync(
      this.paths.stationsLink,
      JSON.stringify(
        Object.fromEntries(this.stationsBySiret),
        this.#jsonReplacer,
        2
      )
    );
  }
}

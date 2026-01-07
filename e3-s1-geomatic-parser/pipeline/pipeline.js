import fs from "fs/promises";
import pLimit from "p-limit";

/**
 * Orchestrateur principal du traitement des offres d'emploi.
 * Cette classe gère :
 * 1. La lecture du flux d'offres.
 * 2. L'enrichissement via les données SIRENE (Repo).
 * 3. La géolocalisation et l'association avec les arrêts de transport (StopRepo).
 * 4. La génération des fichiers de sortie (GeoJSON, Liens, Offres).
 
* @param {Object} sireneRepo - Repository pour l'enrichissement SIRENE.
   * @param {Object} offerRepo - Repository pour la lecture des offres.
   * @param {Object} stopRepo - Repository pour la recherche géospatiale des arrêts.
   * @param {Object} filePaths - Configuration des chemins de sortie.
 */
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

  /**
   * Lance l'exécution complète du pipeline.
   * @returns {Promise<void>}
   */
  async run() {
    console.log("Starting Pipeline...");
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

    await this.#saveFiles();

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log(`\nPipeline finished in ${duration}s.`);
  }

  /**
   * Traite un lot d'offres brutes.
   * Enrichit les données via SIRENE puis finalise le traitement en parallèle.
   * @param {Array} batch - Lot d'offres brutes.
   * @private
   */
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
      console.error("Error processing batch:", error);
    }
  }

  /**
   * Finalise une offre enrichie : génère les IDs, lie les transports et stocke les résultats.
   * @param {Object} enrichedOffer - L'offre enrichie.
   * @private
   */
  async #processFinalizeOffer(enrichedOffer) {
    if (
      !enrichedOffer ||
      !enrichedOffer.workplaceLat ||
      !enrichedOffer.workplaceLon
    )
      return;

    const { storageId, isVirtual } = this.#generateStorageId(enrichedOffer);

    try {
      if (!this.companiesMap.has(storageId)) {
        await this.#handleNewCompanyLocation(
          storageId,
          enrichedOffer,
          isVirtual
        );
      }

      this.#addOfferToMap(storageId, enrichedOffer);

      const companyFeature = this.companiesMap.get(storageId);
      if (companyFeature) {
        companyFeature.properties.offers_count++;
      }
    } catch (err) {
      console.error(`Error finalizing offer ${enrichedOffer.offerId}:`, err);
    }
  }

  /**
   * Génère un ID de stockage unique basé sur le SIRET et la géolocalisation.
   * Crée un hash virtuel si le SIRET est manquant.
   * @param {Object} offer
   * @returns {{storageId: string, isVirtual: boolean}}
   * @private
   */
  #generateStorageId(offer) {
    const latKey = offer.workplaceLat.toFixed(4);
    const lonKey = offer.workplaceLon.toFixed(4);

    if (offer.siret) {
      return {
        storageId: `${offer.siret}_${latKey}_${lonKey}`,
        isVirtual: false,
      };
    }

    const uniqueKey = `${offer.companyName || "Inconnu"}_${latKey}_${lonKey}`;
    const hash = Buffer.from(uniqueKey)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\//g, "_");

    return {
      storageId: `VIRTUAL_${hash}`,
      isVirtual: true,
    };
  }

  /**
   * Traite une nouvelle localisation d'entreprise :
   * - Recherche les arrêts de transport proches.
   * - Crée l'objet GeoJSON "Feature".
   * @param {string} storageId
   * @param {Object} offer
   * @param {boolean} isVirtual
   * @private
   */
  async #handleNewCompanyLocation(storageId, offer, isVirtual) {
    const nearbyStops = await this.stopRepo.findNearby(
      offer.workplaceLat,
      offer.workplaceLon,
      this.SEARCH_RADIUS
    );
    const bestStops = nearbyStops.slice(0, 10);

    bestStops.forEach((s) => {
      if (!this.globalStationsMap.has(s.id)) {
        this.globalStationsMap.set(s.id, {
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          dataset_source_name: s.dataset_custom_title,
          dataset_id: s.dataset_id,
          resource_id: s.resource_id,
          dataset_datagouv_id: s.dataset_datagouv_id,
          resource_datagouv_id: s.resource_datagouv_id,
        });
      }
    });

    this.stationsBySiret.set(storageId, {
      radius: this.SEARCH_RADIUS,
      stations: bestStops.map((s) => ({
        id: s.id,
        distance: s.distance_m,
      })),
    });

    this.companiesMap.set(storageId, {
      type: "Feature",
      id: storageId,
      geometry: {
        type: "Point",
        coordinates: [offer.workplaceLon, offer.workplaceLat],
      },
      properties: {
        siret: offer.siret || "NON_RENSEIGNE",
        storage_id: storageId,
        company: offer.companyName || "Entreprise Inconnue",
        sector: offer.workplaceSector || { naf: "NC", label: "Non renseigné" },
        size: offer.workplaceSize || "Non renseigné",
        is_virtual: isVirtual,
        transport_score: 0,
        isPublic: offer.isPublic || false,
        stations_count: bestStops.length,
        offers_count: 0,
      },
    });
  }

  /**
   * Ajoute les détails de l'offre à la map des offres.
   * @param {string} storageId
   * @param {Object} offer
   * @private
   */
  #addOfferToMap(storageId, offer) {
    if (!this.offersMap.has(storageId)) {
      this.offersMap.set(storageId, []);
    }

    this.offersMap.get(storageId).push({
      offerId: offer.offerId,
      title: offer.offerName || offer.title,
      contractType: offer.contractType,
      offerDescription: offer.offerDescription || offer.description,
      applyUrl: offer.applyUrl,
      targetDiploma: offer.targetDiploma,
      contractDuration: offer.contractDuration,
      contractStart: offer.contractStart,
      accessConditions: offer.accessConditions,
      desiredSkills: offer.desiredSkills,
    });
  }

  /**
   * Sauvegarde les données générées dans des fichiers JSON.
   * Utilise Promise.all pour écrire les 4 fichiers en parallèle.
   * @returns {Promise<void>}
   * @private
   */
  async #saveFiles() {
    console.log("\nSaving files...");

    for (const [id, feature] of this.companiesMap) {
      feature.properties.offers_count = this.offersMap.get(id)?.length || 0;
    }

    const tasks = [
      fs.writeFile(
        this.paths.offers,
        JSON.stringify(
          Object.fromEntries(this.offersMap),
          this.#jsonReplacer,
          2
        )
      ),
      fs.writeFile(
        this.paths.companies,
        JSON.stringify(
          {
            type: "FeatureCollection",
            features: Array.from(this.companiesMap.values()),
          },
          this.#jsonReplacer,
          2
        )
      ),
      fs.writeFile(
        this.paths.stationsRef,
        JSON.stringify(
          Object.fromEntries(this.globalStationsMap),
          this.#jsonReplacer,
          2
        )
      ),
      fs.writeFile(
        this.paths.stationsLink,
        JSON.stringify(
          Object.fromEntries(this.stationsBySiret),
          this.#jsonReplacer,
          2
        )
      ),
    ];

    await Promise.all(tasks);
    console.log("All files saved successfully.");
  }

  /**
   * Affiche la progression dans la console (stdout).
   * @private
   */
  #logProgress() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const speed =
      elapsedSeconds > 0 ? Math.round(this.processedCount / elapsedSeconds) : 0;

    process.stdout.write(
      `\rProcessed: ${this.processedCount} offers | Companies: ${this.companiesMap.size} | Speed: ${speed} offers/s `
    );
  }

  /**
   * Replacer JSON pour gérer les BigInt (retournés par certaines DBs).
   * @private
   */
  #jsonReplacer(key, value) {
    if (typeof value === "bigint") {
      return Number(value);
    }
    return value;
  }
}

import fs from "fs";
import Chain from "stream-chain";
import Parser from "stream-json/Parser.js";
import StreamArray from "stream-json/streamers/StreamArray.js";

/**
 * Repository responsable de la lecture et de la normalisation des offres d'emploi.
 * Utilise une lecture en streaming pour traiter de volumineux fichiers JSON sans surcharger la mémoire.
 * Implémente le pattern Singleton.
 * 
 *  @param {string} offerFilePath - Chemin vers le fichier JSON des offres.
 */
export class OfferRepository {
  static instance = null;

  constructor(offerFilePath) {
    if (OfferRepository.instance) {
      return OfferRepository.instance;
    }

    this.filePath = offerFilePath;
    OfferRepository.instance = this;
  }

  /**
   * Lit le fichier d'offres en streaming et exécute un callback pour chaque offre.
   * Gère la "backpressure" : le flux se met en pause pendant l'exécution du callback asynchrone.
   * * @param {Function} onOfferCallback - Fonction asynchrone appelée pour chaque offre (doit retourner une Promise).
   * @returns {Promise<void>} Résolue à la fin du flux.
   */
  async readAllOffers(onOfferCallback) {
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[OfferRepo] File not found: ${this.filePath}. Skipping.`);
      return;
    }

    console.log(`[OfferRepo] Streaming offers from ${this.filePath}...`);

    const pipeline = new Chain([
      fs.createReadStream(this.filePath),
      new Parser(),
      new StreamArray(),
    ]);


    pipeline.on("data", async ({ value }) => {
      pipeline.pause();
      
      try {
        const offer = this.mapOffer(value);
        if (offer) {
          await onOfferCallback(offer);
        }
      } catch (err) {
        console.error(`[OfferRepo] Error processing offer ${value?.identifier?.id}:`, err);
      } finally {
        pipeline.resume();
      }
    });

    pipeline.on("error", (err) => {
      console.error("[OfferRepo] Stream error:", err);
    });

    return new Promise((resolve) => pipeline.on("end", () => {
      console.log("[OfferRepo] Finished reading offers.");
      resolve();
    }));
  }

  /**
   * Normalise les données brutes du JSON vers le format interne de l'application.
   * @param {Object} data - Objet offre brut issu du JSON.
   * @returns {Object} Objet offre normalisé.
   */
  mapOffer(data) {
    if (!data.workplace || !data.offer) return null;

    let companyName =
      data.workplace.legal_name || data.workplace.name || data.workplace.brand;

    if (!companyName && data.offer.description) {
      companyName = this.#extractNameFromDescription(data.offer.description);
    }

    let nafCode = data.workplace.domain?.naf?.code;
    if (nafCode) {
      nafCode = nafCode.replaceAll(".", "");
    }

    const coords = data.workplace.location?.geopoint?.coordinates;
    const workplaceLat = coords ? coords[1] : null;
    const workplaceLon = coords ? coords[0] : null;

    return {
      offerId: data.identifier?.id,
      siret: data.workplace.siret,
      
      companyName: companyName,
      nafCode: nafCode,
      workplaceSize: data.workplace.size,
      workplaceSector: null,
      isPublic: null,        
      workplaceAddress: data.workplace.location?.address,
      workplaceLat: workplaceLat,
      workplaceLon: workplaceLon,

      offerName: data.offer.title,
      offerDescription: data.offer.description,
      contractType: data.contract?.type,
      contractStart: data.contract?.start,
      contractDuration: data.contract?.duration,
      targetDiploma: data.offer.target_diploma,
      desiredSkills: data.offer.desired_skills,
      accessConditions: data.access_conditions,
      applyUrl: data.apply?.url,
    };
  }

  /**
   * Tente d'extraire le nom de l'entreprise depuis la description via une Regex.
   * Utile pour les offres anonymisées ou mal formattées.
   * @param {string} text 
   * @returns {string|null}
   * @private
   */
  #extractNameFromDescription(text) {
    if (!text) return null;

    const regex =
      /(?:enseigne|société|groupe|entreprise|établissement)\s+([A-Z][a-zA-Z0-9éèà]+(?: [A-Z][a-zA-Z0-9éèà]+)?)/i;
    
    const match = text.match(regex);
    return match ? match[1] : null;
  }
}
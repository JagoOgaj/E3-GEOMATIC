import fs from "fs";
import Chain from "stream-chain";
import Parser from "stream-json/Parser.js";
import StreamArray from "stream-json/streamers/StreamArray.js";

export class OfferRepository {
  constructor(offerFilePath) {
    if (OfferRepository.instance) {
      return OfferRepository.instance;
    }
    this.filePath = offerFilePath;
    OfferRepository.instance = this;
  }

  async readAllOffers(onOfferCallback) {
    const pipeline = new Chain([
      fs.createReadStream(this.filePath),
      new Parser(),
      new StreamArray(),
    ]);

    pipeline.on("data", async ({ value }) => {
      pipeline.pause();
      try {
        const offer = this.mapOffer(value);
        await onOfferCallback(offer);
      } catch (err) {
        console.error(err);
      } finally {
        pipeline.resume();
      }
    });

    pipeline.on("error", console.error);
    return new Promise((resolve) => pipeline.on("end", resolve));
  }

  mapOffer(data) {
    let companyName =
      data.workplace.legal_name || data.workplace.name || data.workplace.brand;

    if (!companyName && data.offer.description) {
      companyName = this.#extractNameFromDescription(data.offer.description);
    }

    let nafCode = data.workplace.domain?.naf?.code;
    if (nafCode) {
      nafCode = nafCode.replace(".", "");
    }

    return {
      offerId: data.identifier.id,
      siret: data.workplace.siret,
      companyName: companyName,
      nafCode: nafCode,

      workplaceAddress: data.workplace.location.address,
      workplaceSize: data.workplace.size,
      workplaceSector: null,
      isPublic: null,

      workplaceLat: data.workplace.location?.geopoint?.coordinates[1] || null,
      workplaceLon: data.workplace.location?.geopoint?.coordinates[0] || null,

      offerDescription: data.offer.description,
      targetDiploma: data.offer.target_diploma,
      desiredSkills: data.offer.desired_skills,
      accessConditions: data.access_conditions,
      offerName: data.offer.title,
      contractType: data.contract.type,
      contractStart: data.contract.start,
      contractDuration: data.contract.duration,
      applyUrl: data.apply.url,
    };
  }

  #extractNameFromDescription(text) {
    if (!text) return null;

    const regex =
      /(?:enseigne|société|groupe|entreprise|établissement)\s+([A-Z][a-zA-Z0-9éèà]+(?: [A-Z][a-zA-Z0-9éèà]+)?)/i;
    const match = text.match(regex);
    return match ? match[1] : null;
  }
}


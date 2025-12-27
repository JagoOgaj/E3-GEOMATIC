import pLimit from "p-limit";

export class SireneRepository {
  tableName = "sirene";

  constructor(db) {
    this.db = db;
    this.companyCache = new Map();
    this.searchCache = new Map();

    this.dbLimit = pLimit(5);
  }

  async enrichCompanies(offers) {
    const siretsToFetch = new Set();

    for (const offer of offers) {
      if (offer.siret && !this.companyCache.has(offer.siret)) {
        siretsToFetch.add(offer.siret);
      }
    }

    if (siretsToFetch.size > 0) {
      await this.#fetchBatchSirets(Array.from(siretsToFetch));
    }

    const tasks = offers.map((offer) => {
      return this.dbLimit(async () => {
        if (offer.siret) {
          const company = this.companyCache.get(offer.siret);
          return company ? this.#mapToDomain(offer, company) : offer;
        }

        return await this.#findAndEnrichMissingSiret(offer);
      });
    });

    return Promise.all(tasks);
  }

  async #fetchBatchSirets(sirets) {
    if (sirets.length === 0) return;
    const placeholders = sirets.map(() => "?").join(",");

    const sql = `
      SELECT *, 
             ST_X(ST_GeomFromWKB(geolocetablissement)) as db_lon, 
             ST_Y(ST_GeomFromWKB(geolocetablissement)) as db_lat 
      FROM ${this.tableName} 
      WHERE siret IN (${placeholders})
    `;
    const rows = await this.db.query(sql, sirets);
    rows.forEach((row) => this.companyCache.set(row.siret, row));
  }

  async #findAndEnrichMissingSiret(offer) {
    const zipCode = this.#extractZipCode(offer.workplaceAddress);
    if (!zipCode) return offer;

    const searchKey = `${offer.companyName || "NONAME"}-${zipCode}-${
      offer.workplaceLat || "NOGEO"
    }`;

    if (this.searchCache.has(searchKey)) {
      const cachedSiret = this.searchCache.get(searchKey);
      if (cachedSiret && this.companyCache.has(cachedSiret)) {
        return this.#mapToDomain(offer, this.companyCache.get(cachedSiret));
      }
      return offer;
    }

    const foundSiret = await this.#cascadeSearch(offer, zipCode);
    this.searchCache.set(searchKey, foundSiret || null);

    if (foundSiret) {
      if (!this.companyCache.has(foundSiret)) {
        await this.#fetchBatchSirets([foundSiret]);
      }
      const company = this.companyCache.get(foundSiret);
      if (company) {
        offer.siret = foundSiret;
        return this.#mapToDomain(offer, company);
      }
    }
    return offer;
  }

  async #cascadeSearch(offer, zipCode) {
    const rawName = offer.companyName || "";

    const cleanName = rawName
      .replace(/['"-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanName) {
      const siret = await this.#searchByNameAndGeo(
        cleanName,
        zipCode,
        offer,
        0.02
      );
      if (siret) return siret;
    }

    if (offer.workplaceLat && offer.workplaceLon && cleanName) {
      const siret = await this.#searchByLocationAndSimilarity(
        offer,
        zipCode,
        0.001,
        cleanName
      );
      if (siret) return siret;
    }

    return null;
  }

  async #searchByNameAndGeo(name, zipCode, offer, radius) {
    let sql = `
      SELECT siret FROM ${this.tableName} 
      WHERE codepostaletablissement = ? 
      AND etatadministratifetablissement = 'A'
    `;
    const params = [zipCode];

    if (offer.workplaceLat && offer.workplaceLon) {
      sql += ` AND lat_cached BETWEEN ? AND ?`;
      sql += ` AND lon_cached BETWEEN ? AND ?`;
      params.push(offer.workplaceLat - radius, offer.workplaceLat + radius);
      params.push(offer.workplaceLon - radius, offer.workplaceLon + radius);
    }

    sql += ` AND (denominationunitelegale ILIKE ? OR enseigne1etablissement ILIKE ?)`;
    const namePattern = `%${name}%`;
    params.push(namePattern, namePattern);

    sql += ` LIMIT 1`;

    try {
      const rows = await this.db.query(sql, params);
      return rows.length > 0 ? rows[0].siret : null;
    } catch (e) {
      return null;
    }
  }

  async #searchByLocationAndSimilarity(offer, zipCode, radius, targetName) {
    const sql = `
        SELECT siret, denominationunitelegale, enseigne1etablissement 
        FROM ${this.tableName} 
        WHERE codepostaletablissement = ?
        AND etatadministratifetablissement = 'A'
        AND ST_Y(ST_GeomFromWKB(geolocetablissement)) BETWEEN ? AND ?
        AND ST_X(ST_GeomFromWKB(geolocetablissement)) BETWEEN ? AND ?
        LIMIT 15
      `;

    const params = [
      zipCode,
      offer.workplaceLat - radius,
      offer.workplaceLat + radius,
      offer.workplaceLon - radius,
      offer.workplaceLon + radius,
    ];

    try {
      const candidates = await this.db.query(sql, params);
      if (candidates.length === 0) return null;

      let bestSiret = null;
      let bestScore = 0;

      for (const c of candidates) {
        const name1 = c.denominationunitelegale || "";
        const name2 = c.enseigne1etablissement || "";

        const s1 = this.#fastSimilarity(targetName, name1);
        const s2 = this.#fastSimilarity(targetName, name2);
        const maxS = s1 > s2 ? s1 : s2;

        if (maxS > bestScore) {
          bestScore = maxS;
          bestSiret = c.siret;
        }
      }

      if (bestScore >= 0.5) {
        return bestSiret;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  #fastSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    if (a === b) return 1;

    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0) return 0;
    if (lenB === 0) return 0;

    if (lenA > lenB) return this.#fastSimilarity(s2, s1);

    let row = new Int32Array(lenA + 1);
    for (let i = 0; i <= lenA; i++) row[i] = i;

    for (let i = 1; i <= lenB; i++) {
      let prev = i;
      for (let j = 1; j <= lenA; j++) {
        let val;
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          val = row[j - 1];
        } else {
          val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
        }
        row[j - 1] = prev;
        prev = val;
      }
      row[lenA] = prev;
    }

    const distance = row[lenA];
    return 1 - distance / Math.max(lenA, lenB);
  }

  #extractZipCode(address) {
    if (!address) return null;
    const match = address.match(/\b\d{5}\b/);
    return match ? match[0] : null;
  }

  #mapToDomain(offer, row) {
    const cat = row.categoriejuridiqueunitelegale;
    const isPublic = cat && (cat.startsWith("7") || cat.startsWith("4"));

    return {
      ...offer,
      siret: row.siret,
      companyName:
        row.enseigne1etablissement ||
        row.denominationunitelegale ||
        offer.companyName,
      isPublic: isPublic,
      workplaceSize: row.trancheeffectifsetablissement,
      workplaceSector: {
        section: row.sectionetablissement,
        nafCode: row.activiteprincipaleetablissement,
        label: row.libelleactiviteprincipale,
      },
      workplaceAddress: [
        row.numerovoieetablissement,
        row.typevoieetablissement,
        row.libellevoieetablissement,
        row.codepostaletablissement,
        row.libellecommuneetablissement,
      ]
        .filter(Boolean)
        .join(" "),
      workplaceLat: row.db_lat || offer.workplaceLat,
      workplaceLon: row.db_lon || offer.workplaceLon,
    };
  }
}

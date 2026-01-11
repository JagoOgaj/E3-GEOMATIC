import { CONFIG } from "../config/config.js";

/**
 * Gestionnaire central des données de l'application.
 * Responsable du chargement (Lazy Loading), de la mise en cache,
 * de la normalisation et du filtrage des données géographiques et métiers.
 */
export class DataManager {
  constructor() {
    this.companiesGeoJson = null;
    this.offersCache = null;
    this.stationsBySiretCache = null;
    this.stationsDetailsCache = null;
  }

  /**
   * Initialise le gestionnaire en téléchargeant le fichier GeoJSON principal des entreprises.
   * Cette méthode doit être appelée au démarrage de l'application.
   * * @returns {Promise<boolean>} Renvoie true si le chargement a réussi, false sinon.
   */
  async init() {
    try {
      const response = await fetch(CONFIG.paths.companies);
      this.companiesGeoJson = await response.json();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retourne l'objet GeoJSON complet des entreprises actuellement chargées en mémoire.
   * * @returns {Object} L'objet GeoJSON (FeatureCollection).
   */
  getCompanies() {
    return this.companiesGeoJson;
  }

  /**
   * Méthode interne. Vérifie si le cache des offres est chargé.
   * Si ce n'est pas le cas, télécharge le fichier JSON contenant toutes les offres.
   * * @returns {Promise<void>}
   * @private
   */
  async #ensureOffersLoaded() {
    if (!this.offersCache) {
      try {
        const res = await fetch(CONFIG.paths.offers);
        this.offersCache = await res.json();
      } catch (e) {
        this.offersCache = {};
      }
    }
  }

  /**
   * Récupère la liste des offres d'emploi associées à un identifiant de stockage d'entreprise.
   * Charge automatiquement le fichier des offres si nécessaire.
   * * @param {string} storageId - L'identifiant unique de stockage de l'entreprise (ex: "VIRTUAL_...").
   * @returns {Promise<Array<Object>>} Une liste d'objets représentant les offres.
   */
  async getOffersByStorageId(storageId) {
    await this.#ensureOffersLoaded();
    return this.offersCache[storageId] || [];
  }

  /**
   * Recherche une offre spécifique par son identifiant unique parmi toutes les entreprises.
   * Utile pour retrouver une offre depuis les favoris.
   * * @param {string} targetId - L'identifiant unique de l'offre.
   * @returns {Promise<Object|null>} L'objet offre complet ou null si non trouvé.
   */
  async findOfferById(targetId) {
    await this.#ensureOffersLoaded();

    for (const key in this.offersCache) {
      const offers = this.offersCache[key];
      const found = offers.find((o) => String(o.offerId) === String(targetId));
      if (found) return found;
    }
    return null;
  }

  /**
   * Méthode interne. Charge en parallèle les fichiers de mapping des stations et les détails des stations.
   * Ne fait rien si les données sont déjà en cache.
   * * @returns {Promise<void>}
   * @private
   */
  async #ensureStationsLoaded() {
    if (this.stationsMappingCache && this.stationsDetailsCache) return;

    try {
      const [mappingRes, detailsRes] = await Promise.all([
        fetch(CONFIG.paths.stationsMapping),
        fetch(CONFIG.paths.stationsDetails),
      ]);

      this.stationsMappingCache = await mappingRes.json();
      this.stationsDetailsCache = await detailsRes.json();
    } catch (e) {
      this.stationsMappingCache = {};
      this.stationsDetailsCache = {};
    }
  }

  /**
   * Récupère et enrichit la liste des stations de transport à proximité d'une entreprise.
   * Effectue une jointure entre le fichier de mapping (stations par siret) et le fichier de détails (noms, coords).
   * * @param {string} storageId - L'identifiant de stockage de l'entreprise.
   * @returns {Promise<Array<Object>>} Une liste triée d'objets stations enrichis.
   */
  async getStationsForCompany(storageId) {
    await this.#ensureStationsLoaded();

    const mappingData = this.stationsMappingCache[storageId];
    if (!mappingData || !mappingData.stations) {
      return [];
    }

    const enrichedStations = mappingData.stations.map((stationLink) => {
      const stationId = stationLink.id;
      const details = this.stationsDetailsCache[stationId];

      const defaultName = "Arrêt inconnu (" + stationId + ")";
      const defaultLat = 0;
      const defaultLon = 0;

      return {
        id: stationId,
        distance: stationLink.distance,
        modes: stationLink.modes || [],
        lines: stationLink.lines || [],
        name: details ? details.name : defaultName,
        lat: details ? details.lat : defaultLat,
        lon: details ? details.lon : defaultLon,
      };
    });

    return enrichedStations.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Normalise le nom du secteur d'activité à partir des propriétés brutes du GeoJSON.
   * Gère les différents formats de données (objet avec section, label, ou string simple).
   * * @param {Object} props - Les propriétés d'une feature GeoJSON.
   * @returns {string} Le nom normalisé du secteur.
   * @private
   */
  #getSectorName(props) {
    if (!props.sector) return "Non renseigné";
    if (props.sector.section) return props.sector.section;
    if (props.sector.label) return props.sector.label;
    if (typeof props.sector === "string") return props.sector;
    return "Autre";
  }

  /**
   * Analyse l'ensemble des données GeoJSON pour extraire la liste unique des secteurs et des tailles d'entreprises.
   * Utilisé pour peupler les listes déroulantes des filtres.
   * * @returns {Object} Un objet contenant deux tableaux triés : { sectors: [], sizes: [] }.
   */
  extractFilterOptions() {
    if (!this.companiesGeoJson) return { sectors: [], sizes: [] };

    const sectorsSet = new Set();
    const sizesSet = new Set();

    this.companiesGeoJson.features.forEach((feature) => {
      const p = feature.properties;
      const sectorName = this.#getSectorName(p);
      sectorsSet.add(sectorName);

      if (p.size) {
        sizesSet.add(p.size);
      }
    });

    return {
      sectors: Array.from(sectorsSet).sort(),
      sizes: Array.from(sizesSet).sort(),
    };
  }

  /**
   * Calcule la distance orthodromique (vol d'oiseau) entre deux points géographiques
   * en utilisant la formule de Haversine.
   * * @param {Object} userPos - Position de l'utilisateur { lat, lng }.
   * @param {Array<number>} targetCoords - Coordonnées cibles [lng, lat] (Format GeoJSON).
   * @returns {number} La distance en kilomètres.
   * @private
   */
  #calculateDistance(userPos, targetCoords) {
    if (!userPos) return 0;
    const R = 6371;
    const dLat = ((targetCoords[1] - userPos.lat) * Math.PI) / 180;
    const dLon = ((targetCoords[0] - userPos.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userPos.lat * Math.PI) / 180) *
        Math.cos((targetCoords[1] * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calcule la distance de Levenshtein entre deux chaînes de caractères.
   * Utilisé pour la recherche approximative (fuzzy search).
   * * @param {string} a - Première chaîne.
   * @param {string} b - Deuxième chaîne.
   * @returns {number} Le nombre de modifications nécessaires pour transformer a en b.
   * @private
   */
  #levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Vérifie si une chaîne source correspond approximativement à une chaîne cible.
   * Utilise soit l'inclusion simple, soit la distance de Levenshtein avec une tolérance.
   * * @param {string} source - Le texte dans lequel on cherche (ex: nom de l'entreprise).
   * @param {string} target - Le mot-clé recherché.
   * @returns {boolean} True si correspondance trouvée, False sinon.
   * @private
   */
  #fuzzyMatch(source, target) {
    if (!target) return true;
    if (!source) return false;

    const s = source.toLowerCase();
    const t = target.toLowerCase();

    if (s.includes(t)) return true;

    if (t.length > 3) {
      const dist = this.#levenshteinDistance(s, t);
      const tolerance = Math.max(2, Math.floor(t.length * 0.3));
      return dist <= tolerance;
    }

    return false;
  }

  /**
   * Filtre la liste des entreprises selon un ensemble de critères complexes.
   * Gère les filtres par secteur, taille, rayon géographique, score de transport,
   * modes de transport et recherche textuelle (entreprise ou offre).
   * * @param {Object} filters - Objet contenant les critères de filtrage.
   * @param {Array<string>} [filters.sectors] - Liste des secteurs autorisés.
   * @param {Array<string>} [filters.size] - Liste des tailles d'entreprise autorisées.
   * @param {number} [filters.radius] - Rayon de recherche en km autour de l'utilisateur.
   * @param {Object} [filters.userPosition] - Position de référence {lat, lng}.
   * @param {number} [filters.score] - Score minimum de desservance.
   * @param {Array<string>} [filters.transportModes] - Modes de transport requis.
   * @param {string} [filters.text] - Texte de recherche.
   * @param {string} [filters.searchType] - Type de recherche ('company' ou 'offer').
   * @returns {Promise<Object>} Un objet GeoJSON (FeatureCollection) contenant les résultats filtrés.
   */
  async filterCompanies(filters) {
    if (!this.companiesGeoJson)
      return { type: "FeatureCollection", features: [] };

    if (
      filters.text &&
      filters.text.length > 2 &&
      filters.searchType === "offer"
    ) {
      await this.#ensureOffersLoaded();
    }

    const filteredFeatures = this.companiesGeoJson.features.filter(
      (feature) => {
        const p = feature.properties;

        if (filters.sectors && filters.sectors.length > 0) {
          const sectorName = this.#getSectorName(p);
          if (!filters.sectors.includes(sectorName)) return false;
        }

        if (filters.size && filters.size.length > 0) {
          if (!filters.size.includes(p.size)) return false;
        }

        if (filters.radius < 100 && filters.userPosition) {
          const dist = this.#calculateDistance(
            filters.userPosition,
            feature.geometry.coordinates
          );
          if (dist > filters.radius) return false;
        }

        if (filters.score > 0) {
          const companyScore = p.transport_score || 0;
          if (companyScore < filters.score) return false;
        }

        if (filters.transportModes && filters.transportModes.length > 0) {
          const companyModes = (p.transport_modes || []).map((m) =>
            m.toUpperCase()
          );
          const hasMode = filters.transportModes.some((mode) =>
            companyModes.includes(mode)
          );
          if (!hasMode) return false;
        }

        if (filters.text && filters.text.trim() !== "") {
          const searchStr = filters.text.trim();
          if (filters.searchType === "company") {
            if (!this.#fuzzyMatch(p.company, searchStr)) return false;
          } else if (filters.searchType === "offer") {
            const offers = this.offersCache
              ? this.offersCache[p.storage_id]
              : [];
            if (!offers || offers.length === 0) return false;
            const hasMatchingOffer = offers.some((o) =>
              this.#fuzzyMatch(o.title, searchStr)
            );
            if (!hasMatchingOffer) return false;
          }
        }

        return true;
      }
    );

    return {
      type: "FeatureCollection",
      features: filteredFeatures,
    };
  }
}

/**
 * Utilitaire pour les calculs géographiques et géodésiques
 * Fournit des méthodes pour calculer des distances entre coordonnées GPS
 */
export class GeoCalculator {
  /**
   * Rayon moyen de la Terre en mètres
   * @type {number}
   */
  static EARTH_RADIUS_METERS = 6371000;

  /**
   * Facteur de conversion Degrés vers Radians (PI / 180)
   * Pré-calculé pour optimiser les performances
   * @type {number}
   */
  static DEG_TO_RAD = Math.PI / 180;

  constructor() {}

  /**
   * Calcule la distance précise entre deux points GPS en utilisant la formule de Haversine
   * Prend en compte la courbure de la Terre
   *
   * @param {number} lat1 - Latitude du point de départ (degrés)
   * @param {number} lon1 - Longitude du point de départ (degrés)
   * @param {number} lat2 - Latitude du point d'arrivée (degrés)
   * @param {number} lon2 - Longitude du point d'arrivée (degrés)
   * @returns {number} La distance en mètres
   */
  getDistance(lat1, lon1, lat2, lon2) {
    const lat1Rad = lat1 * GeoCalculator.DEG_TO_RAD;
    const lat2Rad = lat2 * GeoCalculator.DEG_TO_RAD;

    const deltaLatRad = (lat2 - lat1) * GeoCalculator.DEG_TO_RAD;
    const deltaLonRad = (lon2 - lon1) * GeoCalculator.DEG_TO_RAD;

    const haversineValue =
      Math.sin(deltaLatRad / 2) ** 2 +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) ** 2;

    const centralAngle =
      2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

    return GeoCalculator.EARTH_RADIUS_METERS * centralAngle;
  }
}

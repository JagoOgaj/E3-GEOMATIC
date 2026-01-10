/**
 * Calcule la distance à vol d'oiseau entre deux points géographiques
 * en utilisant la formule de Haversine.
 * * Dépendances : Aucune.
 * @param {number} lat1 - Latitude du point de départ.
 * @param {number} lon1 - Longitude du point de départ.
 * @param {number} lat2 - Latitude du point d'arrivée.
 * @param {number} lon2 - Longitude du point d'arrivée.
 * @returns {number} La distance en mètres.
 */
export const getDist = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad) * Math.cos(lat2*rad) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
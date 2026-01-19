/**
 * Définition des frontières géographiques de la France métropolitaine et de la Corse.
 * * Cette constante contient une liste de polygones (tableaux de coordonnées [latitude, longitude])
 * représentant une approximation précise des contours du territoire français.
 * * Elle est principalement utilisée par le MapManager pour :
 * - Valider si une position sélectionnée ou géolocalisée se situe bien en France.
 * - Restreindre le périmètre de recherche ou d'affichage.
 * - Recentrer la vue sur le territoire national en cas de dépassement des limites.
 * * @type {Array<Array<Array<number>>>}
 */
export const FRANCE_POLYGONS = [
  // L'Hexagone
  [
    [51.1, 2.5],
    [50.9, 1.8],
    [49.9, 0.9],
    [49.7, -1.9],
    [48.7, -4.8],
    [47.5, -3.0],
    [46.2, -1.3],
    [43.4, -1.8],
    [42.4, 3.1],
    [43.0, 3.0],
    [43.2, 5.5],
    [43.5, 7.4],
    [43.9, 7.3],
    [44.3, 6.8],
    [45.9, 6.9],
    [47.6, 7.5],
    [49.0, 8.2],
    [49.5, 6.2],
  ],
  // La Corse
  [
    [43.02, 9.4],
    [42.7, 8.55],
    [41.35, 9.15],
    [41.6, 9.35],
    [42.3, 9.6],
  ],
];

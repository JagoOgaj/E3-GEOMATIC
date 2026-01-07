import fs from "fs/promises";

/**
 * Responsable de l'identification et de l'agrégation des jeux de données (Datasets)
 * nécessaires au fonctionnement de l'application.
 *
 * Elle analyse les arrêts de transport liés aux entités (entreprises/lieux) et croise
 * ces informations avec le référentiel des arrêts pour déterminer quels fichiers GTFS
 * doivent être téléchargés
 *  * @param {Object} filePaths - Configuration des chemins de fichiers
 * @param {string} filePaths.stationsRef - Chemin vers le JSON contenant les métadonnées de tous les arrêts (référentiel)
 * @param {string} filePaths.stationsLink - Chemin vers le JSON liant les entités (SIRET) aux IDs d'arrêts
 * @param {string} filePaths.requiredDatasets - Chemin de sortie pour le fichier JSON final listant les datasets requis
 */
export class DatasetAggregator {
  constructor(filePaths) {
    this.paths = {
      stationsMetadata: filePaths.stationsRef,
      stationLinks: filePaths.stationsLink,
      outputDatasets: filePaths.requiredDatasets,
    };
  }

  /**
   * Exécute le processus d'agrégation
   * 1 Lit les fichiers sources
   * 2 Extrait les datasets uniques (déduplication par ID ressource data.gouv)
   * 3 Écrit le résultat sur le disque
   *
   * @returns {Promise<Array<Object>>} La liste des objets datasets identifiés et sauvegardés
   * @throws {Error} Si la lecture des fichiers ou l'écriture échoue
   */
  async process() {
    try {
      const [stationsReference, linksData] = await Promise.all([
        this.#readJson(this.paths.stationsMetadata),
        this.#readJson(this.paths.stationLinks),
      ]);

      const distinctDatasets = new Map();

      for (const entry of Object.values(linksData)) {
        if (!entry.stations || !Array.isArray(entry.stations)) continue;

        for (const stationLink of entry.stations) {
          const stationInfo = stationsReference[stationLink.id];

          if (stationInfo && stationInfo.resource_datagouv_id) {
            const resourceKey = stationInfo.resource_datagouv_id;

            if (!distinctDatasets.has(resourceKey)) {
              distinctDatasets.set(resourceKey, {
                dataset_id: stationInfo.dataset_id,
                resource_id: stationInfo.resource_id,
                dataset_datagouv_id: stationInfo.dataset_datagouv_id,
                resource_datagouv_id: stationInfo.resource_datagouv_id,
                dataset_source_name: stationInfo.dataset_source_name,
                dataset_custom_title:
                  stationInfo.dataset_custom_title ||
                  stationInfo.dataset_source_name,
              });
            }
          }
        }
      }

      const results = Array.from(distinctDatasets.values());

      await fs.writeFile(
        this.paths.outputDatasets,
        JSON.stringify(results, null, 2)
      );

      return results;
    } catch (error) {
      throw new Error(`DatasetAggregator failed: ${error.message}`);
    }
  }

  /**
   * Méthode utilitaire privée pour lire et parser un fichier JSON
   * @param {string} filePath - Le chemin du fichier à lire
   * @returns {Promise<Object>} Le contenu du fichier parsé
   * @private
   */
  async #readJson(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  }
}

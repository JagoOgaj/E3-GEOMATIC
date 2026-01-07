import fs from "fs";
import path from "path";
import StreamZip from "node-stream-zip";
import { pipeline } from "stream/promises";
import readline from "readline";
import { ConsoleLock } from "../../utils/consoleLock.js";

/**
 * Gère le téléchargement, la décompression et l'organisation des fichiers GTFS
 * Cette classe supporte le téléchargement direct via URL ou une résolution assistée
 * en cas d'ambiguïté ou d'erreur (intervention utilisateur via console)
 *
 * @param {string} baseDir - Dossier racine où seront stockés les datasets
 */
export class GtfsDownloader {
  static #resolvedDatasets = new Set();

  constructor(baseDir) {
    this.baseDir = baseDir;
    this.#ensureDir();
  }

  /**
   * Vérifie et crée le répertoire de base si nécessaire
   * @private
   */
  #ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Supprime intégralement le contenu du dossier de téléchargement et le recrée
   * Cette méthode est destructrice et sert à repartir sur une base propre
   */
  clearBaseDir() {
    if (fs.existsSync(this.baseDir)) {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
    }
    this.#ensureDir();
    GtfsDownloader.#resolvedDatasets.clear();
  }

  /**
   * Traite une liste d'URLs simples et les télécharge séquentiellement
   * Les dossiers de sortie sont nommés séquentiellement (dataset_1, dataset_2...)
   * @param {Array<string>} urlList - Liste des URLs directes vers les fichiers zip
   * @returns {Promise<Array<string>>} Liste des chemins locaux des dossiers extraits
   */
  async downloadList(urlList) {
    const downloadedPaths = [];

    for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i];
      const id = `dataset_${i + 1}`;

      try {
        const path = await this.#downloadDirect(url, id);
        downloadedPaths.push(path);
      } catch (err) {
        console.error(`Download failed for ${url}: ${err.message}`);
      }
    }
    return downloadedPaths;
  }

  /**
   * Méthode de convenance pour télécharger une URL unique directement vers un ID de dataset.
   * Crée le dossier cible s'il n'existe pas.
   *
   * @param {string} url - L'URL du fichier ZIP.
   * @param {string} datasetId - L'identifiant unique pour nommer le dossier de sortie.
   * @returns {Promise<string>} Le chemin complet vers le dossier extrait.
   * @private
   */
  async #downloadDirect(url, datasetId) {
    const targetDir = path.join(this.baseDir, String(datasetId));

    if (this.#isAlreadyDone(datasetId, targetDir)) {
      return targetDir;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await this.#downloadAndExtract(url, targetDir, datasetId);
    GtfsDownloader.#resolvedDatasets.add(String(datasetId));
    return targetDir;
  }

  /**
   * Télécharge un fichier ZIP spécifique et l'extrait dans un répertoire cible existant.
   * Cette méthode est conçue pour être additive : elle ne supprime pas le contenu existant,
   * permettant ainsi de fusionner plusieurs ZIPs dans le même dossier.
   *
   * @param {string} url - L'URL directe du fragment ZIP à télécharger.
   * @param {string} targetDir - Le chemin du répertoire où extraire les fichiers.
   * @param {string} tempIdSuffix - Suffixe pour garantir l'unicité du fichier temporaire.
   * @returns {Promise<void>}
   * @private
   */
  async #downloadAndExtract(url, targetDir, tempIdSuffix) {
    const tempFileName = `temp_${tempIdSuffix}_${Date.now()}.zip`;
    const tempZipPath = path.join(this.baseDir, tempFileName);

    try {
      const response = await fetch(url.trim());
      if (!response.ok)
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);

      await pipeline(response.body, fs.createWriteStream(tempZipPath));

      const zip = new StreamZip.async({ file: tempZipPath });
      await zip.extract(null, targetDir);
      await zip.close();
    } finally {
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
    }
  }

  /**
   * Tente de télécharger un dataset. Gère automatiquement les cas simples (1 candidat)
   * et demande une intervention utilisateur en cas de conflit ou d'erreur.
   * Supporte le téléchargement de multiples fragments (URLs multiples) fusionnés dans le même dossier.
   *
   * @param {string} datasetId - ID du dataset.
   * @param {Array<Object>} candidates - Liste des objets métadonnées possibles.
   * @returns {Promise<string|null>} Le chemin du dossier final ou null si l'utilisateur a ignoré (skip).
   */
  async download(datasetId, candidates) {
    const targetDir = path.join(this.baseDir, String(datasetId));

    if (this.#isAlreadyDone(datasetId, targetDir)) {
      return targetDir;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let currentUrls = [];
    let errorReason = null;

    const firstCandidate = candidates.length > 0 ? candidates[0] : null;
    const dataGouvId = firstCandidate?.dataset_datagouv_id || datasetId;

    if (candidates.length > 1) {
      errorReason = "Multiple candidates detected for this ID";
    } else if (candidates.length === 1) {
      const meta = candidates[0];
      const url = meta.resource_datagouv_id
        ? `https://www.data.gouv.fr/fr/datasets/r/${meta.resource_datagouv_id}`
        : `https://transport.data.gouv.fr/resources/${meta.resource_id}/download`;
      currentUrls = [url];
    } else {
      errorReason = "No candidates found";
    }

    while (true) {
      if (currentUrls.length > 0 && !errorReason) {
        try {
          for (const url of currentUrls) {
            await this.#downloadAndExtract(url, targetDir, datasetId);
          }
          GtfsDownloader.#resolvedDatasets.add(String(datasetId));
          return targetDir;
        } catch (error) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
            fs.mkdirSync(targetDir, { recursive: true });
          }
          errorReason = error.message;
        }
      }

      const userResponse = await ConsoleLock.getInstance().runExclusive(
        async () => {
          if (this.#isAlreadyDone(datasetId, targetDir)) {
            return "skip";
          }
          return await this.#askUserForResolution(
            dataGouvId,
            candidates,
            errorReason,
          );
        },
      );

      if (this.#isAlreadyDone(datasetId, targetDir)) {
        return targetDir;
      }

      if (userResponse === "skip") {
        if (
          fs.existsSync(targetDir) &&
          fs.readdirSync(targetDir).length === 0
        ) {
          fs.rmdirSync(targetDir);
        }
        return null;
      }
      currentUrls = userResponse;
      errorReason = null;
    }
  }

  /**
   * Vérifie si un dataset a déjà été traité (téléchargé et extrait) avec succès.
   * Cette méthode agit comme un mécanisme de mise en cache à deux niveaux :
   * 1. Vérification en mémoire (pour éviter les doublons dans la session active).
   * 2. Vérification sur le disque (pour ne pas retélécharger des fichiers existants).
   *
   * @param {string} datasetId - L'identifiant unique du dataset.
   * @param {string} targetDir - Le chemin absolu vers le dossier de destination.
   * @returns {boolean} True si le dataset est déjà prêt, False s'il doit être téléchargé.
   * @private
   */
  #isAlreadyDone(datasetId, targetDir) {
    if (GtfsDownloader.#resolvedDatasets.has(String(datasetId))) {
      return true;
    }
    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      GtfsDownloader.#resolvedDatasets.add(String(datasetId));
      return true;
    }
    return false;
  }

  /**
   * Affiche les informations de conflit et invite l'utilisateur à saisir une ou plusieurs URLs manuelles.
   * Gère le cas où plusieurs fichiers GTFS doivent être fusionnés pour une même zone.
   *
   * @param {string} datasetId - L'ID du dataset problématique.
   * @param {Array<Object>} candidates - Les métadonnées disponibles pour aider à la décision.
   * @param {string} reason - La raison de l'échec précédent.
   * @returns {Promise<Array<string>|string>} Un tableau d'URLs valides ou la chaîne 'skip'.
   * @private
   */
  async #askUserForResolution(datasetId, candidates, reason) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n--- MANUAL INTERVENTION REQUIRED ---");
    console.log(`Dataset ID: ${datasetId}`);
    console.log(`Error: ${reason}`);
    console.log("Available Candidates:");
    console.log(`url : https://www.data.gouv.fr/datasets/${datasetId}`);

    console.table(
      candidates.map((c) => ({
        datagouv_id: c.dataset_datagouv_id,
        res_datagouv: c.resource_datagouv_id,
        res_id: c.resource_id,
        title: c.dataset_custom_title?.substring(0, 40),
      })),
    );

    console.log("To merge multiple files, separate URLs with a comma (,)");

    return new Promise((resolve) => {
      const ask = () => {
        rl.question("Enter direct .zip URL(s) (or type 'skip'): ", (answer) => {
          const clean = answer.trim();
          if (clean) {
            rl.close();
            if (clean.toLowerCase() === "skip") {
              resolve("skip");
            } else {
              const urls = clean
                .split(",")
                .map((u) => u.trim())
                .filter(Boolean);
              resolve(urls);
            }
          } else {
            ask();
          }
        });
      };
      ask();
    });
  }
}

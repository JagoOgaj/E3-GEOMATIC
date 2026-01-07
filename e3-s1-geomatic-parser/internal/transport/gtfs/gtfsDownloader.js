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
        const path = await this._downloadDirect(url, id);
        downloadedPaths.push(path);
      } catch (err) {
        console.error(`Download failed for ${url}: ${err.message}`);
      }
    }
    return downloadedPaths;
  }

  /**
   * Télécharge un fichier ZIP depuis une URL, l'enregistre temporairement,
   * l'extrait dans un dossier cible, puis nettoie le fichier temporaire
   * Si le dossier cible existe déjà et n'est pas vide, le téléchargement est ignoré
   * @param {string} url - L'URL du fichier ZIP
   * @param {string} datasetId - L'identifiant unique pour nommer le dossier de sortie
   * @returns {Promise<string>} Le chemin complet vers le dossier extrait
   * @private
   */
  async _downloadDirect(url, datasetId) {
    const targetDir = path.join(this.baseDir, String(datasetId));

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      return targetDir;
    }

    const tempZipPath = path.join(this.baseDir, `temp_${datasetId}.zip`);

    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);

      await pipeline(response.body, fs.createWriteStream(tempZipPath));

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const zip = new StreamZip.async({ file: tempZipPath });
      await zip.extract(null, targetDir);
      await zip.close();

      return targetDir;
    } finally {
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
    }
  }

  /**
   * Tente de télécharger un dataset à partir d'une liste de métadonnées candidates
   * En cas d'échec ou d'ambiguïté (plusieurs candidats), demande à l'utilisateur
   * de fournir une URL valide manuellement via la console
   * @param {string} datasetId - ID du dataset
   * @param {Array<Object>} candidates - Liste des objets métadonnées possibles
   * @returns {Promise<string|null>} Le chemin du dossier extrait ou null si ignoré
   */
  async download(datasetId, candidates) {
    const targetDir = path.join(this.baseDir, String(datasetId));

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      return targetDir;
    }

    let currentUrl = null;
    let errorReason = null;

    const firstCandidate = candidates.length > 0 ? candidates[0] : null;
    const dataGouvId = firstCandidate?.dataset_datagouv_id || datasetId;

    if (candidates.length > 1) {
      errorReason = "Multiple candidates detected for this ID";
    } else if (candidates.length === 1) {
      const meta = candidates[0];
      currentUrl = meta.resource_datagouv_id
        ? `https://www.data.gouv.fr/fr/datasets/r/${meta.resource_datagouv_id}`
        : `https://transport.data.gouv.fr/resources/${meta.resource_id}/download`;
    } else {
      errorReason = "No candidates found";
    }

    while (true) {
      if (currentUrl && !errorReason) {
        try {
          return await this._downloadDirect(currentUrl, datasetId);
        } catch (error) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          errorReason = error.message;
        }
      }

      const userUrl = await ConsoleLock.getInstance().runExclusive(async () => {
        return this.#askUserForResolution(dataGouvId, candidates, errorReason);
      });

      if (userUrl === "skip") {
        return null;
      }

      currentUrl = userUrl;
      errorReason = null;
    }
  }

  /**
   * Affiche les informations de conflit et invite l'utilisateur à saisir une URL manuelle
   * @param {string} datasetId - L'ID du dataset problématique
   * @param {Array<Object>} candidates - Les métadonnées disponibles pour aide à la décision
   * @param {string} reason - La raison de l'échec précédent
   * @returns {Promise<string>} L'URL saisie par l'utilisateur ou 'skip'
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

    console.table(
      candidates.map((c) => ({
        datagouv_id: c.dataset_datagouv_id,
        res_datagouv: c.resource_datagouv_id,
        res_id: c.resource_id,
        title: c.dataset_custom_title?.substring(0, 40),
      }))
    );

    return new Promise((resolve) => {
      const ask = () => {
        rl.question("Enter direct .zip URL (or type 'skip'): ", (answer) => {
          const clean = answer.trim();
          if (clean) {
            rl.close();
            resolve(clean);
          } else {
            ask();
          }
        });
      };
      ask();
    });
  }
}

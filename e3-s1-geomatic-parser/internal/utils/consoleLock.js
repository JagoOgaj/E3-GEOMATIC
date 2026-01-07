/**
 * Gestionnaire de verrou (Mutex) simple basé sur les Promesses.
 * Permet d'exécuter des tâches asynchrones de manière séquentielle (FIFO).
 * Utile pour empêcher l'entrelacement de logs dans la console ou l'accès concurrent à une ressource unique.
 */
export class ConsoleLock {
  static instance = null;

  constructor() {
    if (ConsoleLock.instance) {
      return ConsoleLock.instance;
    }
    this.queue = Promise.resolve();
    ConsoleLock.instance = this;
  }

  /**
   * Retourne l'instance unique du verrou.
   * @returns {ConsoleLock}
   */
  static getInstance() {
    if (!ConsoleLock.instance) {
      new ConsoleLock();
    }
    return ConsoleLock.instance;
  }

  /**
   * Exécute une fonction de manière exclusive.
   * La fonction attendra que toutes les tâches précédentes soient terminées (ou aient échoué).
   * * @param {Function} task - La fonction asynchrone à exécuter.
   * @returns {Promise<any>} Le résultat de la tâche une fois exécutée.
   */
  async runExclusive(task) {
    const result = this.queue.then(() => task());
    this.queue = result.catch(() => {});
    return result;
  }
}

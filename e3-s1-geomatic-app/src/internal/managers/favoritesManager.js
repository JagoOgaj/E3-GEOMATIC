/**
 * Gestionnaire des favoris de l'application.
 * Permet d'ajouter, supprimer, lister et persister les offres d'emploi favorites
 * dans le LocalStorage du navigateur. Implémente le pattern Observer pour notifier l'UI.
 */
export class FavoritesManager {
  constructor() {
    this.storageKey = "geojob_favorites";
    this.favorites = this.#loadFromStorage() || [];
    this.listeners = [];
  }

  /**
   * Récupère la liste complète des offres actuellement stockées dans les favoris.
   * @returns {Array<Object>} Le tableau des objets favoris.
   */
  getFavorites() {
    return this.favorites;
  }

  /**
   * Vérifie si une offre spécifique est déjà présente dans les favoris.
   * @param {string|number} offerId - L'identifiant unique de l'offre à vérifier.
   * @returns {boolean} True si l'offre est favorite, False sinon.
   */
  isFavorite(offerId) {
    if (!offerId) return false;
    return this.favorites.some((f) => String(f.id) === String(offerId));
  }

  /**
   * Bascule l'état de favori d'une offre : l'ajoute si elle est absente, la retire si elle est présente.
   * @param {Object} offer - L'objet représentant l'offre d'emploi.
   * @returns {boolean} True si l'offre a été ajoutée, False si elle a été retirée.
   */
  toggleFavorite(offer) {
    const idToCheck = offer.offerId;

    if (this.isFavorite(idToCheck)) {
      this.removeFavorite(idToCheck);
      return false;
    } else {
      this.addFavorite(offer);
      return true;
    }
  }

  /**
   * Ajoute une offre aux favoris, normalise ses propriétés et sauvegarde le tout.
   * Déclenche la notification aux abonnés.
   * @param {Object} offer - L'objet offre brut provenant des données.
   */
  addFavorite(offer) {
    const favItem = {
      id: offer.offerId,
      title: offer.title,
      offerDescription: offer.offerDescription,
      company: offer.company || "Entreprise Inconnu",
      contract: Array.isArray(offer.contractType)
        ? offer.contractType[0]
        : offer.contractType,
      applyUrl: offer.applyUrl,
      dateAdded: new Date().toISOString(),
      ...offer,
    };

    this.favorites.push(favItem);
    this.#saveToStorage();
    this.#notifyListeners();
  }

  /**
   * Supprime une offre des favoris via son identifiant.
   * Déclenche la notification aux abonnés après suppression.
   * @param {string|number} idToDelete - L'identifiant de l'offre à supprimer.
   */
  removeFavorite(idToDelete) {
    this.favorites = this.favorites.filter(
      (f) => String(f.id) !== String(idToDelete)
    );
    this.#saveToStorage();
    this.#notifyListeners();
  }

  /**
   * Permet à un composant de s'abonner aux changements de la liste des favoris.
   * @param {Function} callback - La fonction à exécuter lors d'une mise à jour (reçoit la liste des favoris).
   */
  subscribe(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notifie tous les abonnés en exécutant leur callback avec la liste à jour.
   * Méthode privée.
   */
  #notifyListeners() {
    this.listeners.forEach((cb) => cb(this.favorites));
  }

  /**
   * Persiste la liste actuelle des favoris dans le LocalStorage.
   * Méthode privée.
   */
  #saveToStorage() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
  }

  /**
   * Charge la liste des favoris depuis le LocalStorage au démarrage.
   * Gère silencieusement les erreurs de parsing.
   * Méthode privée.
   * @returns {Array<Object>} La liste des favoris chargée ou un tableau vide en cas d'erreur.
   */
  #loadFromStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
}

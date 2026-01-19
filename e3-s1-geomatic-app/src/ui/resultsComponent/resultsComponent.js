import { FavoritesManager } from "../../internal/managers/favoritesManager.js";
import { DataManager } from "../../internal/managers/dataManager.js";

/**
 * Composant d'interface affichant la liste des résultats de recherche sous forme de volet rétractable.
 * Gère le chargement infini (infinite scroll), l'affichage des entreprises et de leurs offres,
 * ainsi que les interactions utilisateur (favoris, ouverture détails).
 * * Dépendances :
 * @param {string} parentId - L'ID de l'élément DOM parent (ex: 'ui-layer').
 * @param {FavoritesManager} favManager - Gestionnaire des favoris pour l'état des boutons.
 * @param {DataManager} dataManager - Gestionnaire de données pour récupérer les offres détaillées.
 */
export class ResultsComponent {
  constructor(parentId, favManager, dataManager) {
    this.parent = document.getElementById(parentId);
    this.favManager = favManager;
    this.dataManager = dataManager;

    this.element = null;
    this.isExpanded = false;

    this.allCompanies = [];
    this.currentTextFilter = "";
    this.batchSize = 25;
    this.renderedCount = 0;

    this.observer = null;
    this.sentinelElement = null;

    this.onExpand = null;
    this.onCollapse = null;
    this.onItemClick = null;
  }

  /**
   * Initialise le widget, crée sa structure HTML de base (en-tête et conteneur vide),
   * l'ajoute au DOM et configure les observateurs et événements.
   * @returns {void}
   */
  init() {
    this.element = document.createElement("div");
    this.element.className = "results-widget";

    this.element.innerHTML = `
        <div class="res-header">
            <div class="res-icon-box"><i class="fas fa-list-ul"></i></div>
            <div class="res-summary">
                <span class="res-title">Résultats</span>
                <span class="res-subtitle">En attente de recherche...</span>
            </div>
            <!-- Bouton d'export avec menu déroulant -->
            <div class="res-export-menu">
                <button class="res-export-btn" title="Exporter les résultats">
                    <i class="fas fa-download"></i>
                </button>
                <div class="res-export-dropdown">
                    <button class="export-option" data-format="txt">Format texte (.txt)</button>
                    <button class="export-option" data-format="json">JSON</button>
                    <button class="export-option" data-format="csv">CSV</button>
                </div>
            </div>
            <div class="res-toggle-icon"><i class="fas fa-chevron-up"></i></div>
        </div>
        <div class="res-content"></div>
    `;

    this.parent.appendChild(this.element);
    this.#initIntersectionObserver();
    this.#setupEvents();
  }

  /**
   * Méthode privée. Configure l'IntersectionObserver pour gérer le chargement infini (infinite scroll)
   * lorsque l'utilisateur fait défiler la liste vers le bas.
   * @returns {void}
   * @private
   */
  #initIntersectionObserver() {
    const options = {
      root: this.element.querySelector(".res-content"),
      rootMargin: "100px",
      threshold: 0.1,
    };
    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        this.#renderNextBatch();
      }
    }, options);
  }

  /**
   * Met à jour la liste des résultats avec de nouvelles données GeoJSON.
   * Réinitialise le scroll, vide le conteneur et lance le rendu du premier lot.
   * @param {Object} geoJson - L'objet GeoJSON contenant les entreprises trouvées.
   * @param {string} textFilter - Filtre textuel optionnel appliqué à la recherche.
   * @returns {void}
   */
  updateResults(geoJson, textFilter = "") {
    const features = geoJson && geoJson.features ? geoJson.features : [];

    this.allCompanies = features.map((f) => f.properties);
    this.currentTextFilter = textFilter;
    this.renderedCount = 0;

    this.#updateHeader();

    const container = this.element.querySelector(".res-content");
    container.innerHTML = "";

    if (this.sentinelElement) {
      this.observer.unobserve(this.sentinelElement);
      this.sentinelElement = null;
    }

    if (this.isExpanded) {
      this.#renderNextBatch();
    }

    if (
      this.allCompanies.length > 0 &&
      this.allCompanies.length < 5 &&
      textFilter
    ) {
      this.expand();
    }
  }

  /**
   * Méthode privée. Affiche le lot suivant d'entreprises dans la liste (pagination côté client).
   * Gère également l'ajout et la suppression de l'élément sentinelle pour le scroll infini.
   * @returns {void}
   * @private
   */
  #renderNextBatch() {
    if (this.renderedCount >= this.allCompanies.length) return;

    const container = this.element.querySelector(".res-content");

    if (this.sentinelElement) {
      this.observer.unobserve(this.sentinelElement);
      this.sentinelElement.remove();
    }

    const nextBatch = this.allCompanies.slice(
      this.renderedCount,
      this.renderedCount + this.batchSize
    );

    const html = nextBatch
      .map((company) => {
        const sectorHtml =
          company.sector &&
          company.sector.section &&
          company.sector.section != "Non renseigné"
            ? `<span class="company-sector">${company.sector.section}</span>`
            : company.sector &&
              company.sector.label &&
              company.sector.label != "Non renseigné"
            ? `<span class="company-sector">${company.sector.label}</span>`
            : "";

        return `
            <div class="company-card" data-storage-id="${company.storage_id}">
                <div class="company-header">
                    <div class="company-info">
                        <span class="company-name">${company.company}</span>
                        ${sectorHtml}
                    </div>
                    <div class="header-right">
                        <span class="company-badge">${
                          company.offers_count || 0
                        } offres</span>
                        <i class="fas fa-chevron-down accordion-chevron"></i>
                    </div>
                </div>
                
                <div class="offers-list-container" id="offers-${
                  company.storage_id
                }">
                    <div class="loader-placeholder">
                        <i class="fas fa-circle-notch fa-spin"></i> Chargement...
                    </div>
                </div>
            </div>
        `;
      })
      .join("");

    container.insertAdjacentHTML("beforeend", html);
    this.renderedCount += nextBatch.length;

    if (this.renderedCount < this.allCompanies.length) {
      this.sentinelElement = document.createElement("div");
      this.sentinelElement.className = "scroll-sentinel";
      this.sentinelElement.innerHTML = '<div style="height:20px;"></div>';
      container.appendChild(this.sentinelElement);
      this.observer.observe(this.sentinelElement);
    }
  }

  /**
   * Méthode privée. Met à jour le texte et le style de l'en-tête du widget
   * en fonction du nombre de résultats trouvés.
   * @returns {void}
   * @private
   */
  #updateHeader() {
    const count = this.allCompanies.length;
    const titleEl = this.element.querySelector(".res-title");
    const subEl = this.element.querySelector(".res-subtitle");
    const iconEl = this.element.querySelector(".res-icon-box");

    if (count === 0) {
      titleEl.textContent = "Aucun résultat";
      subEl.textContent = "Essayez d'autres filtres";
      iconEl.innerHTML = `<i class="fas fa-search" style="color:white"></i>`;
      iconEl.style.background = "#95a5a6";
    } else {
      titleEl.textContent = "Entreprises trouvées";
      subEl.textContent = `${count} résultat${count > 1 ? "s" : ""}`;
      iconEl.innerHTML = `<i class="fas fa-list-ul" style="color:white"></i>`;
      iconEl.style.background = "#3498db";
    }
  }

  /**
   * Méthode privée. Attache les gestionnaires d'événements :
   * - Clic sur le header pour expand/collapse.
   * - Délégation d'événements pour les clics sur les entreprises (accordéon).
   * - Délégation d'événements pour les clics sur les offres et les boutons favoris.
   * @returns {void}
   * @private
   */
  #setupEvents() {
    const header = this.element.querySelector(".res-header");
    header.addEventListener("click", () => {
      if (this.isExpanded) this.collapse();
      else this.expand();
    });

    const contentContainer = this.element.querySelector(".res-content");
    contentContainer.addEventListener("click", async (e) => {
      const header = e.target.closest(".company-header");
      if (header) {
        e.stopPropagation();
        const card = header.closest(".company-card");
        const wasOpen = card.classList.contains("open");

        this.element
          .querySelectorAll(".company-card.open")
          .forEach((c) => c.classList.remove("open"));

        if (!wasOpen) {
          card.classList.add("open");
          const storageId = card.dataset.storageId;
          await this.#loadAndRenderOffers(storageId);
        }
        return;
      }

      const offerItem = e.target.closest(".offer-item");
      if (offerItem) {
        if (e.target.closest(".btn-fav")) {
          this.#handleFavClick(e, offerItem);
          return;
        }
        const offerId = offerItem.dataset.id;
        const card = offerItem.closest(".company-card");
        const storageId = card.dataset.storageId;
        const offers = await this.dataManager.getOffersByStorageId(storageId);
        const offerObj = offers.find(
          (o) => String(o.offerId) === String(offerId)
        );

        if (this.onItemClick && offerObj) {
          this.onItemClick(offerObj, storageId);
        }
      }
    });

   // Fonctionnalité du bouton d'export
   const exportBtn = this.element.querySelector('.res-export-btn');
   const exportMenu = this.element.querySelector('.res-export-menu');
   const exportOptions = this.element.querySelectorAll('.export-option');

   // Afficher/masquer le menu d'export lors du clic sur le bouton
   exportBtn.addEventListener('click', (e) => {
     e.stopPropagation();
     exportMenu.classList.toggle('active');
   });

   // Gérer les clics sur les options d'export
   exportOptions.forEach(option => {
     option.addEventListener('click', async (e) => {
       e.stopPropagation();
       const format = e.target.dataset.format;
       await this.#exportResults(format);
       exportMenu.classList.remove('active');
     });
   });

   // Fermer le menu d'export lorsqu'on clique ailleurs
   document.addEventListener('click', (e) => {
     if (!exportMenu.contains(e.target)) {
       exportMenu.classList.remove('active');
     }
   });
 }

 /**
  * Exporte les résultats dans le format spécifié
  * @param {string} format - Le format d'export ('txt', 'json', ou 'csv')
  * @private
  */
 async #exportResults(format) {
   if (this.allCompanies.length === 0) return;

   // Préparer les données - inclure le nom de l'entreprise, le nom de l'offre et l'URL de candidature
   const exportData = [];
   
   // Parcourir toutes les entreprises
   for (const company of this.allCompanies) {
     try {
       // Récupérer les offres pour cette entreprise
       const offers = await this.dataManager.getOffersByStorageId(company.storage_id);
       
       // Pour chaque offre, ajouter une entrée dans les données d'export
       for (const offer of offers) {
         exportData.push({
           companyName: company.company,
           offerName: offer.title,
           applyUrl: offer.applyUrl || ''
         });
       }
     } catch (error) {
       console.error(`Erreur lors de la récupération des offres pour ${company.company}:`, error);
       // Continuer avec les autres entreprises même si une erreur se produit
     }
   }

   let content, mimeType, extension;

   switch (format) {
     case 'txt':
       content = exportData.map(item =>
         `Nom de l'entreprise : ${item.companyName}\n` +
         `Nom de l'offre : ${item.offerName}\n` +
         `Url pour postuler : ${item.applyUrl}\n`
       ).join('\n');
       mimeType = 'text/plain';
       extension = 'txt';
       break;
     case 'json':
       content = JSON.stringify(exportData, null, 2);
       mimeType = 'application/json';
       extension = 'json';
       break;
     case 'csv':
       const headers = ['companyName', 'offerName', 'applyUrl'];
       const rows = exportData.map(item => `"${item.companyName.replace(/"/g, '""')}","${item.offerName.replace(/"/g, '""')}","${item.applyUrl.replace(/"/g, '""')}"`);
       content = [headers.join(','), ...rows].join('\n');
       mimeType = 'text/csv';
       extension = 'csv';
       break;
     default:
       return;
   }

   // Déclencher le téléchargement du fichier
   const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = `resultats-recherche.${extension}`;
   document.body.appendChild(link);
   link.click();
   document.body.removeChild(link);
   URL.revokeObjectURL(url);
 }

  /**
   * Méthode privée. Charge les données détaillées des offres pour une entreprise
   * via le DataManager et génère le HTML correspondant.
   * @param {string} storageId - L'identifiant de stockage de l'entreprise.
   * @returns {Promise<void>}
   * @private
   */
  async #loadAndRenderOffers(storageId) {
    const containerId = `offers-${storageId}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!container.querySelector(".loader-placeholder")) return;

    try {
      let offers = await this.dataManager.getOffersByStorageId(storageId);

      if (this.currentTextFilter && this.currentTextFilter.length > 2) {
        const search = this.currentTextFilter.toLowerCase();
        offers = offers.filter(
          (o) =>
            o.title.toLowerCase().includes(search) ||
            (o.description && o.description.toLowerCase().includes(search))
        );
      }

      if (offers.length === 0) {
        container.innerHTML = `<div class="no-offers">Aucune offre.</div>`;
        return;
      }

      container.innerHTML = offers
        .map((offer) => {
          const isFav = this.favManager.isFavorite(offer.offerId);
          return `
                <div class="offer-item" data-id="${offer.offerId}">
                    <div class="offer-main-info">
                        <span class="offer-title">${offer.title}</span>
                        <span class="offer-contract">${
                          Array.isArray(offer.contractType)
                            ? offer.contractType[0]
                            : offer.contractType || "CDI"
                        }</span>
                    </div>
                    <div class="res-actions">
                        <button class="action-btn btn-fav ${
                          isFav ? "active" : ""
                        }" title="Favori">
                            <i class="${isFav ? "fas" : "far"} fa-heart"></i>
                        </button>
                        <button class="action-btn btn-view" title="Voir détail">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
              `;
        })
        .join("");
    } catch (error) {
      container.innerHTML = `<div style="color:red; padding:10px;">Erreur.</div>`;
    }
  }

  /**
   * Méthode privée. Gère le clic sur le bouton "Favori" d'une offre dans la liste.
   * Ajoute ou retire le favori via le FavoritesManager et met à jour l'icône.
   * @param {Event} e - L'événement de clic.
   * @param {HTMLElement} offerItem - L'élément DOM représentant l'offre.
   * @returns {Promise<void>}
   * @private
   */
  async #handleFavClick(e, offerItem) {
    e.stopPropagation();
    const btn = e.target.closest(".btn-fav");
    const offerId = offerItem.dataset.id;
    const card = offerItem.closest(".company-card");
    const storageId = card.dataset.storageId;
    const offers = await this.dataManager.getOffersByStorageId(storageId);
    const offerObj = offers.find((o) => String(o.offerId) === String(offerId));
    const companyName = card.querySelector(".company-name").textContent;
    const fullOffer = {
      ...offerObj,
      company: companyName,
      storage_id: storageId,
    };

    if (this.favManager.isFavorite(offerId)) {
      this.favManager.removeFavorite(offerId);
      btn.classList.remove("active");
      btn.querySelector("i").className = "far fa-heart";
    } else {
      this.favManager.addFavorite(fullOffer);
      btn.classList.add("active");
      btn.querySelector("i").className = "fas fa-heart";
    }
  }

  /**
   * Déploie le panneau de résultats pour le rendre visible.
   * Lance le rendu du premier lot si ce n'est pas déjà fait.
   * @returns {void}
   */
  expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.element.classList.add("expanded");
    if (this.renderedCount === 0) this.#renderNextBatch();
    if (this.onExpand) this.onExpand();
  }

  /**
   * Replie le panneau de résultats.
   * @returns {void}
   */
  collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.element.classList.remove("expanded");
    if (this.onCollapse) this.onCollapse();
  }
}

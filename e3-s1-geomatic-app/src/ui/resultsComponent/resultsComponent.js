/**
 * Composant gérant l'affichage de la liste des résultats de recherche (entreprises).
 *
 * Fonctionnalités principales :
 * - Affichage des résultats sous forme de liste déroulante.
 * - Gestion du "Scroll Infini" (Lazy Loading) pour optimiser les performances avec de grands jeux de données.
 * - Interaction avec le gestionnaire de favoris (ajout/retrait).
 * - Exportation des résultats (TXT, CSV, JSON).
 * - Gestion de l'état étendu/réduit du panneau latéral.
 *
 * @param {string} parentId - L'ID de l'élément DOM parent où le widget sera injecté.
 * @param {Object} favManager - Instance du gestionnaire de favoris pour vérifier l'état des items.
 * @param {Object} dataManager - Instance du gestionnaire de données (non utilisé directement ici mais conservé par convention).
 */
export class ResultsComponent {
  constructor(parentId, favManager, dataManager, searchComponent) {
    this.parent = document.getElementById(parentId);
    this.favManager = favManager;
    this.dataManager = dataManager;
    this.searchComponent = searchComponent;
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
   * Initialise le composant :
   * - Crée la structure DOM du widget (en-tête, liste vide, menu d'export).
   * - Attache les événements globaux (clic bouton export, fermeture menu au clic extérieur).
   * - Prépare le conteneur pour recevoir les résultats.
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
            <div class="res-actions-header">
                <button class="btn-export-trigger" title="Exporter">
                    <i class="fas fa-download"></i>
                </button>
                <div class="export-menu hidden">
                    <div class="export-option" data-format="txt">Texte (.txt)</div>
                    <div class="export-option" data-format="csv">CSV (.csv)</div>
                    <div class="export-option" data-format="json">JSON (.json)</div>
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
   * Méthode privée.
   * Initialise et configure l'IntersectionObserver pour la gestion du "Scroll Infini".
   * Définit les options de détection (zone de scroll, marge de préchargement de 100px)
   * et le callback qui déclenche le rendu du lot suivant (`#renderNextBatch`)
   * lorsque l'élément sentinelle entre dans la zone visible.
   * @private
   */
  #initIntersectionObserver() {
    const options = {
      root: this.element.querySelector(".res-content"),
      rootMargin: "100px",
      threshold: 0.1,
    };
    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) this.#renderNextBatch();
    }, options);
  }

  /**
   * Met à jour les résultats affichés en traitant les données GeoJSON brutes.
   * Regroupe les entités (features) par nom d'entreprise, agrège les offres et
   * les identifiants de stockage, puis réinitialise l'affichage de la liste.
   * Gère également la réinitialisation du scroll infini et ajuste l'état
   * d'expansion du panneau en fonction du nombre de résultats trouvés.
   *
   * @param {Object} geoJson - L'objet GeoJSON contenant les entités à traiter.
   * @param {string} [textFilter=""] - Le filtre textuel appliqué lors de la recherche.
   */
  updateResults(geoJson, textFilter = "") {
    const features = geoJson && geoJson.features ? geoJson.features : [];
    const groupsMap = new Map();

    features.forEach((f) => {
      const props = f.properties;
      const rawName = props.company || "Entreprise Inconnue";
      const normalizedKey = rawName.trim().toLowerCase();

      if (!groupsMap.has(normalizedKey)) {
        groupsMap.set(normalizedKey, {
          company: rawName,
          sectorObj: props.sector,
          offers_count: 0,
          storage_ids: [],
        });
      }

      const group = groupsMap.get(normalizedKey);
      group.storage_ids.push(props.storage_id);

      group.offers_count += props.offers_count || 0;

      group.total_offers +=
        props.total_offers !== undefined
          ? props.total_offers
          : props.offers_count || 0;

      if (
        (!group.sectorObj ||
          (!group.sectorObj.label && !group.sectorObj.section)) &&
        props.sector
      ) {
        group.sectorObj = props.sector;
      }
    });

    this.allCompanies = Array.from(groupsMap.values());
    this.allCompanies.sort((a, b) => a.company.localeCompare(b.company));

    this.currentTextFilter = textFilter;
    this.renderedCount = 0;
    this.#updateHeader();

    const container = this.element.querySelector(".res-content");
    container.innerHTML = "";
    if (this.sentinelElement) {
      this.observer.unobserve(this.sentinelElement);
      this.sentinelElement = null;
    }

    if (this.isExpanded) this.#renderNextBatch();
    if (
      this.allCompanies.length > 0 &&
      this.allCompanies.length < 5 &&
      textFilter
    )
      this.expand();
  }

  /**
   * Méthode privée.
   * Génère et injecte le prochain lot (batch) d'entreprises dans le DOM pour le scroll infini.
   * Cette méthode calcule la tranche de données à afficher, transforme les objets
   * entreprises en structures HTML (cartes avec accordéons), gère l'affichage des badges
   * d'offres et déplace l'élément sentinelle pour permettre la détection du prochain chargement.
   * Elle assure également le nettoyage de l'ancien observateur avant de l'attacher au
   * nouveau marqueur de fin de liste.
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
      this.renderedCount + this.batchSize,
    );

    const html = nextBatch
      .map((group, index) => {
        let sectorLabel = "Secteur non renseigné";
        if (group.sectorObj) {
          if (
            group.sectorObj.section &&
            group.sectorObj.section !== "Non renseigné"
          )
            sectorLabel = group.sectorObj.section;
          else if (
            group.sectorObj.label &&
            group.sectorObj.label !== "Non renseigné"
          )
            sectorLabel = group.sectorObj.label;
        }

        const domId = `group-${this.renderedCount + index}`;
        const storageIdsJson = JSON.stringify(group.storage_ids);

        let badgeText = `${group.offers_count} offres`;

        return `
            <div class="company-card" data-storage-ids='${storageIdsJson}'>
                <div class="company-header">
                    <div class="company-info">
                        <span class="company-name">${group.company}</span>
                        <span class="company-sector">${sectorLabel}</span>
                    </div>
                    <div class="header-right">
                        <span class="company-badge">${badgeText}</span>
                        <i class="fas fa-chevron-down accordion-chevron"></i>
                    </div>
                </div>
                <div class="offers-list-container" id="${domId}">
                    <div class="loader-placeholder"><i class="fas fa-circle-notch fa-spin"></i> Chargement...</div>
                </div>
            </div>`;
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
   * Méthode privée.
   * Met à jour les éléments textuels et visuels de l'en-tête du composant de résultats.
   * Ajuste dynamiquement le titre, le sous-titre (compteur de résultats) et l'icône
   * (ainsi que sa couleur de fond) selon que des entreprises ont été trouvées ou non
   * suite à l'application des filtres.
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
   * Méthode privée.
   * Centralise et configure l'ensemble des écouteurs d'événements du composant de résultats.
   * Gère les interactions suivantes :
   * - Menu d'exportation : Ouverture/fermeture du menu et déclenchement des exports (TXT, CSV, JSON).
   * - Panneau latéral : Bascule entre l'état réduit et étendu lors du clic sur l'en-tête.
   * - Accordéons d'entreprises : Ouverture d'une carte, fermeture des autres et chargement asynchrone des offres.
   * - Interactions sur les offres : Gestion du clic sur les favoris et déclenchement du callback de sélection
   * d'une offre pour affichage des détails ou interaction avec la carte.
   * @private
   */
  #setupEvents() {
    const header = this.element.querySelector(".res-header");
    const exportBtn = this.element.querySelector(".btn-export-trigger");
    const exportMenu = this.element.querySelector(".export-menu");

    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("hidden");
    });
    exportMenu.querySelectorAll(".export-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        this.#exportResults(opt.dataset.format);
        exportMenu.classList.add("hidden");
      });
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".res-actions-header"))
        exportMenu.classList.add("hidden");
    });

    header.addEventListener("click", (e) => {
      if (e.target.closest(".res-actions-header")) return;
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

        this.element.querySelectorAll(".company-card.open").forEach((c) => {
          c.classList.remove("open");
        });

        if (!wasOpen) {
          card.classList.add("open");
          const storageIds = JSON.parse(card.dataset.storageIds);

          await this.#loadAndRenderOffers(
            storageIds,
            card.querySelector(".offers-list-container"),
          );
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
        const storageIds = JSON.parse(card.dataset.storageIds);

        let foundOffer = null;
        let foundStorageId = null;

        for (const sid of storageIds) {
          const offers = await this.dataManager.getOffersByStorageId(sid);
          const o = offers.find(
            (off) => String(off.offerId) === String(offerId),
          );
          if (o) {
            foundOffer = o;
            foundStorageId = sid;
            break;
          }
        }

        if (this.onItemClick && foundOffer)
          this.onItemClick(foundOffer, foundStorageId);
      }
    });
  }

  /**
   * Méthode privée.
   * Charge de manière asynchrone et affiche la liste des offres d'emploi pour une entreprise donnée.
   * * Cette méthode effectue les actions suivantes :
   * - Récupère les offres depuis le DataManager pour tous les identifiants de stockage fournis.
   * - Applique un filtrage textuel si une recherche est active.
   * - Implémente un système de "sous-scroll infini" (pagination par batch) à l'intérieur de l'accordéon.
   * - Gère l'état visuel des favoris pour chaque offre.
   * - Utilise un IntersectionObserver local au conteneur de l'entreprise pour optimiser le rendu.
   *
   * @param {string[]} storageIds - Liste des identifiants techniques permettant de récupérer les offres.
   * @param {HTMLElement} container - Le conteneur DOM (liste d'offres) de la carte entreprise.
   * @private
   */
  async #loadAndRenderOffers(storageIds, container) {
    if (!container) return;

    if (
      !container.querySelector(".loader-placeholder") &&
      container.children.length > 0
    )
      return;

    try {
      const promises = storageIds.map((id) =>
        this.dataManager.getOffersByStorageId(id),
      );
      const results = await Promise.all(promises);

      let allOffers = [];
      results.forEach((offersList, index) => {
        const sourceId = storageIds[index];
        offersList.forEach((o) =>
          allOffers.push({ ...o, _originStorageId: sourceId }),
        );
      });

      const searchFilters = this.searchComponent
        ? this.searchComponent.filters
        : null;

      if (
        searchFilters &&
        searchFilters.text &&
        searchFilters.text.length > 0 &&
        searchFilters.searchType === "offer"
      ) {
        const search = searchFilters.text.toLowerCase();

        allOffers = allOffers.filter((o) => {
          const titleMatch = o.title && o.title.toLowerCase().includes(search);
          return titleMatch;
        });
      }

      container.innerHTML = "";

      if (allOffers.length === 0) {
        const isFiltered =
          searchFilters &&
          searchFilters.searchType === "offer" &&
          searchFilters.text;
        const msg = isFiltered
          ? `Aucune offre ne correspond à "${searchFilters.text}" pour cette entreprise.`
          : `Aucune offre disponible.`;

        container.innerHTML = `<div class="no-offers">${msg}</div>`;
        return;
      }

      let currentRenderCount = 0;
      const BATCH_SIZE = 10;

      const sentinel = document.createElement("div");
      sentinel.className = "offer-scroll-sentinel";

      container.appendChild(sentinel);

      const renderBatch = () => {
        if (currentRenderCount >= allOffers.length) return;

        const batch = allOffers.slice(
          currentRenderCount,
          currentRenderCount + BATCH_SIZE,
        );

        const html = batch
          .map((offer) => {
            const isFav = this.favManager.isFavorite(offer.offerId);
            return `
                <div class="offer-item" data-id="${offer.offerId}" data-origin-storage="${offer._originStorageId}">
                    <div class="offer-main-info">
                        <span class="offer-title">${offer.title}</span>
                        <span class="offer-contract">${Array.isArray(offer.contractType) ? offer.contractType[0] : offer.contractType || "CDI"}</span>
                    </div>
                    <div class="res-actions">
                        <button class="action-btn btn-fav ${isFav ? "active" : ""}" title="Favori">
                            <i class="${isFav ? "fas" : "far"} fa-heart"></i>
                        </button>
                        <button class="action-btn btn-view" title="Voir détail">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>`;
          })
          .join("");

        sentinel.insertAdjacentHTML("beforebegin", html);

        currentRenderCount += batch.length;

        if (currentRenderCount >= allOffers.length) {
          if (localObserver) localObserver.disconnect();
          sentinel.remove();
        }
      };

      const localObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            renderBatch();
          }
        },
        {
          root: container,
          rootMargin: "50px",
        },
      );

      localObserver.observe(sentinel);

      renderBatch();
    } catch (error) {
      console.error(error);
      container.innerHTML = `<div style="color:red; padding:10px;">Erreur chargement.</div>`;
    }
  }

  /**
   * Méthode privée.
   * Gère le basculement (toggle) de l'état favori d'une offre spécifique.
   * Cette méthode :
   * - Récupère les métadonnées complètes de l'offre auprès du DataManager.
   * - Ajoute ou supprime l'offre de la liste des favoris via le FavManager.
   * - Met à jour l'interface utilisateur (icône de cœur et classe active) en temps réel.
   * * @param {Event} e - L'événement de clic d'origine.
   * @param {HTMLElement} offerItem - L'élément DOM représentant l'offre cliquée.
   * @private
   */
  async #handleFavClick(e, offerItem) {
    e.stopPropagation();
    const btn = e.target.closest(".btn-fav");
    const offerId = offerItem.dataset.id;
    const originStorageId = offerItem.dataset.originStorage;
    const card = offerItem.closest(".company-card");
    const companyName = card.querySelector(".company-name").textContent;
    const offers = await this.dataManager.getOffersByStorageId(originStorageId);
    const offerObj = offers.find((o) => String(o.offerId) === String(offerId));
    if (!offerObj) return;

    const fullOffer = {
      ...offerObj,
      company: companyName,
      storage_id: originStorageId,
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
   * Méthode privée.
   * Orchestre la génération et le téléchargement d'un fichier d'export contenant
   * l'intégralité des résultats actuels (entreprises et offres associées).
   * Processus :
   * 1. Récupère récursivement toutes les offres pour chaque entreprise listée.
   * 2. Formate les données selon le type demandé (Texte brut, JSON structuré ou CSV).
   * 3. Crée un objet Blob et simule un clic de téléchargement dans le navigateur.
   * * @param {string} format - Le format de sortie souhaité ('txt', 'json', 'csv').
   * @private
   */
  async #exportResults(format) {
    if (this.allCompanies.length === 0) return;
    const exportData = [];
    for (const companyGroup of this.allCompanies) {
      try {
        const promises = companyGroup.storage_ids.map((id) =>
          this.dataManager.getOffersByStorageId(id),
        );
        const results = await Promise.all(promises);
        const allOffers = results.flat();
        for (const offer of allOffers) {
          exportData.push({
            companyName: companyGroup.company,
            offerName: offer.title,
            applyUrl: offer.applyUrl || "",
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    let content, mimeType, extension;
    switch (format) {
      case "txt":
        content = exportData
          .map(
            (item) =>
              `Entreprise: ${item.companyName}\nOffre: ${item.offerName}\nLien: ${item.applyUrl}\n`,
          )
          .join("\n----------------\n");
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "json":
        content = JSON.stringify(exportData, null, 2);
        mimeType = "application/json";
        extension = "json";
        break;
      case "csv":
        const headers = ["companyName", "offerName", "applyUrl"];
        const rows = exportData.map(
          (item) =>
            `"${item.companyName.replace(/"/g, '""')}","${item.offerName.replace(/"/g, '""')}","${item.applyUrl.replace(/"/g, '""')}"`,
        );
        content = [headers.join(","), ...rows].join("\n");
        mimeType = "text/csv";
        extension = "csv";
        break;
      default:
        return;
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resultats-recherche.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Interface publique permettant de déclencher l'exportation des données.
   * Sert de relais vers la méthode privée de traitement des fichiers.
   * * @param {string} format - Le format de fichier cible ('txt', 'json', 'csv').
   */
  exportData(format) {
    this.#exportResults(format);
  }

  /**
   * Déploie le panneau des résultats pour afficher la liste complète.
   * Si aucun résultat n'a encore été rendu physiquement dans le DOM,
   * déclenche l'affichage du premier lot (batch). Appelle également
   * le callback de notification d'expansion si défini.
   */
  expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.element.classList.add("expanded");
    if (this.renderedCount === 0) this.#renderNextBatch();
    if (this.onExpand) this.onExpand();
  }

  /**
   * Réduit le panneau des résultats pour libérer de l'espace sur l'interface.
   * Met à jour l'état visuel via les classes CSS et appelle le callback
   * de notification de réduction si défini.
   */
  collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.element.classList.remove("expanded");
    if (this.onCollapse) this.onCollapse();
  }
}

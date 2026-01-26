/**
 * Composant gérant les fenêtres modales de l'application.
 * Il est responsable de l'affichage détaillé d'une offre d'emploi (description,
 * transports à proximité, bouton itinéraire) ainsi que de l'affichage d'une liste
 * d'offres groupées pour une même entreprise.
 * * Le constructeur initialise les conteneurs DOM, stocke les références vers les
 * gestionnaires de favoris et de carte, et configure les callbacks d'interaction.
 *
 * @param {FavoritesManager} favManager - Instance gérant la persistance des favoris.
 * @param {MapManager} mapManager - Instance gérant la carte (utilisée pour vérifier la position utilisateur).
 */
export class ModalComponent {
  constructor(favManager, mapManager, searchComponent) {
   this.parent = document.body;
   this.container = null;
   this.currentOffer = null;
   this.favManager = favManager;
   this.mapManager = mapManager;
   this.searchComponent = searchComponent;

   this.onShowStationsOnMap = null;
   this.onItineraryCallback = null;
   
   // Callback pour notifier le UIManager du changement de visibilité
   this.onVisibilityChange = null;

   this.init();
 }

  /**
   * Initialise le squelette HTML de la modale principale, l'injecte dans le document
   * et configure la fermeture automatique lors d'un clic sur l'overlay (fond sombre).
   */
  init() {
    // Ne pas créer le container ici, seulement quand on en a besoin
    this.container = null;
  }
  
  createContainer() {
    this.container = document.createElement("div");
    this.container.id = "offer-modal";
    this.container.className = "modal-wrapper hidden";
    this.container.innerHTML = `<div class="modal-content" id="modal-content-box"></div>`;
    this.parent.appendChild(this.container);
    
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) this.hide();
    });
  }

  /**
   * Masque la modale de détail, réinitialise le défilement (scroll) du corps de la page
   * et met à jour les classes CSS pour l'animation de sortie.
   */
  hide() {
   if (!this.container) return;
   
   this.container.classList.remove("hidden");
   
   this.container.classList.add("hidden");
   document.body.style.overflow = "";
   
   // Notifier le UIManager que la modale est cachée
   if (this.onVisibilityChange) {
     this.onVisibilityChange(false);
   }
   
   // Hide transports when modal is closed
   if (this.mapManager && this.mapManager.clearStations) {
     this.mapManager.clearStations();
   }
   
   // Retirer complètement le modal du DOM quand il est caché
   setTimeout(() => {
     if (this.container && this.container.classList.contains("hidden")) {
       this.container.remove();
       this.container = null;
     }
   }, 300);
 }

  /**
   * Affiche la modale principale sans bloquer le défilement de l'arrière-plan
   * et affiche les transports sur la carte.
   */
  show() {
   if (!this.container) {
     this.createContainer();
   }
   if (this.container) {
     this.container.classList.remove("hidden");
     // Ne pas bloquer le défilement pour permettre l'interaction avec la carte
     document.body.style.overflow = "";
     
     // Notifier le UIManager que la modale est visible
     if (this.onVisibilityChange) {
       this.onVisibilityChange(true);
     }
   }
 }

  /**
   * Prépare et ouvre la vue détaillée d'une offre d'emploi spécifique.
   * Cette méthode :
   * - Fusionne les données de l'offre et de l'entreprise.
   * - Vérifie la disponibilité de la position utilisateur pour activer/désactiver le bouton itinéraire.
   * - Génère le header et le footer de la modale avec les boutons d'action (Postuler, Itinéraire, Favori).
   * - Déclenche le rendu du corps du message et la gestion des événements.
   * * @param {Object} offer - L'objet contenant les données de l'offre d'emploi.
   * @param {Object} companyInfo - Informations complémentaires sur l'entreprise (nom, secteur).
   * @param {Array} [stations=[]] - Liste des stations de transport à proximité trouvées.
   */
  openOfferDetail(offer, companyInfo, stations = []) {
    // S'assurer que le container existe avant de l'utiliser
    if (!this.container) {
      this.createContainer();
    }
    this.currentOffer = { ...offer, ...(companyInfo || {}) };
    const companyName =
      this.currentOffer.company || offer.companyName || "Entreprise";
    const contentBox = this.container.querySelector("#modal-content-box");

    const hasLocation =
      this.mapManager &&
      this.mapManager.userPosition &&
      this.mapManager.userPosition.lat;

    const btnDisabledClass = hasLocation ? "" : "disabled-btn";
    const btnDisabledAttr = hasLocation ? "" : "disabled";
    const btnTitle = hasLocation
      ? "Calculer l'itinéraire"
      : "Activez votre localisation pour calculer un itinéraire";

    contentBox.innerHTML = `
      <div class="modal-header detail-mode">
          <div class="modal-title-group">
            <h2 class="modal-title detail-title">${offer.title}</h2>
            <p class="modal-companyName"><i class="fas fa-building"></i> ${companyName}</p>
          </div>
          <button class="modal-close-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body-scroll" id="modal-dynamic-body"></div>
      <div class="modal-footer-grid">
          <button class="footer-btn btn-fav" id="footer-fav-btn">
              <i class="far fa-heart"></i>
          </button>
          
          <div class="footer-export-menu" id="footer-export-menu">
              <button class="footer-btn btn-export" id="footer-export-btn">
                  <i class="fas fa-download"></i>
              </button>
              <div class="export-dropdown" id="export-dropdown">
                  <button class="export-option" data-format="txt">Texte (.txt)</button>
                  <button class="export-option" data-format="csv">CSV (.csv)</button>
                  <button class="export-option" data-format="json">JSON (.json)</button>
              </div>
          </div>
          
          <button class="footer-btn btn-route ${btnDisabledClass}" title="${btnTitle}" ${btnDisabledAttr}>
              <i class="fas fa-route"></i> Itinéraire
          </button>
          
          <a href="${offer.applyUrl || "#"}" target="_blank" class="footer-btn btn-apply">
              <i class="fas fa-paper-plane"></i> Postuler
          </a>
      </div>
    `;

    if (this.container) {
      this.container
        .querySelector(".modal-close-btn")
        .addEventListener("click", () => this.hide());
    }

    // Configuration du menu d'export
    const exportMenu = this.container.querySelector("#footer-export-menu");
    const exportBtn = this.container.querySelector("#footer-export-btn");
    const exportOptions = this.container.querySelectorAll(".export-option");
    
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle("active");
      });
      
      // Gérer les clics sur les options d'export
      exportOptions.forEach(option => {
        option.addEventListener("click", (e) => {
          e.stopPropagation();
          const format = e.target.dataset.format;
          this.#exportOffer(offer, companyInfo, format);
          exportMenu.classList.remove("active");
        });
      });
      
      // Fermer le menu d'export lorsqu'on clique ailleurs
      document.addEventListener("click", (e) => {
        if (exportMenu && !exportMenu.contains(e.target)) {
          exportMenu.classList.remove("active");
        }
      });
    }

    this.#renderDetailBody(offer, stations);
    this.#setupFooterEvents();
    this.#updateFavoriteBtnState();
    
    // Afficher les transports sur la carte quand la modale s'ouvre
    if (this.mapManager && this.mapManager.displayStations) {
      this.mapManager.displayStations(stations);
    }
    
    this.show();
  }

  /**
   * Méthode privée.
   * Génère le contenu dynamique du corps de la modale :
   * - Badges d'informations (type de contrat, date, diplôme).
   * - Bloc de description formaté.
   * - Liste des stations de transport avec icônes adaptées (Métro, Bus, Train) et distances.
   * - Bouton de visualisation des stations sur la carte.
   * * @param {Object} offer - Données de l'offre.
   * @param {Array} stations - Liste des stations à afficher.
   * @private
   */
  #renderDetailBody(offer, stations) {
    const body = this.container.querySelector("#modal-dynamic-body");
    let contractText = Array.isArray(offer.contractType)
      ? offer.contractType.join(" / ")
      : offer.contractType || "Non spécifié";
    let dateHtml = offer.contractStart
      ? `<span class="info-pill highlight-pill"><i class="far fa-calendar-alt"></i> ${offer.contractStart.split("T")[0]}</span>`
      : "";
    let diplomaHtml = offer.targetDiploma?.label
      ? `<span class="info-pill"><i class="fas fa-graduation-cap"></i> ${offer.targetDiploma.label}</span>`
      : "";

    let stationsHtml = "";
    if (stations && stations.length > 0) {
      const listItems = stations
        .map((st) => {
          const modes = st.modes || [];
          let mainIconClass = "fas fa-bus";
          if (
            modes.some(
              (m) =>
                m.toUpperCase().includes("TRAIN") ||
                m.toUpperCase().includes("RER"),
            )
          )
            mainIconClass = "fas fa-train";
          else if (modes.some((m) => m.toUpperCase().includes("METRO")))
            mainIconClass = "fas fa-subway";
          else if (modes.some((m) => m.toUpperCase().includes("TRAM")))
            mainIconClass = "fas fa-tram";

          const pillsHtml = modes
            .map(
              (m) => `<span class="mode-pill ${m.toLowerCase()}">${m}</span>`,
            )
            .join("");
          return `
                <div class="station-item">
                    <div class="station-icon"><i class="${mainIconClass}"></i></div>
                    <div class="station-content">
                        <div class="station-header">
                            <strong>${st.name || "Arrêt inconnu"}</strong>
                            <span class="station-dist">${Math.round(st.distance)}m</span>
                        </div>
                        <div class="station-modes">${pillsHtml}</div>
                    </div>
                </div>`;
        })
        .join("");

      stationsHtml = `
            <div class="detail-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:36px; margin-bottom:12px; border-bottom: 2px solid #f1f3f5; padding-bottom: 8px;">
                    <h3 class="section-title" style="border:none; margin:0; padding:0;">
                        <i class="fas fa-map-signs"></i> Transports (${stations.length})
                    </h3>
                </div>
                <div class="stations-list">
                    ${listItems}
                </div>
            </div>`;
    } else {
      stationsHtml = `
            <div class="detail-section">
                <h3 class="section-title"><i class="fas fa-map-signs"></i> Transports</h3>
                <p style="color:#7f8c8d; font-style:italic;">Aucune station à proximité immédiate.</p>
            </div>`;
    }

    body.innerHTML = `
        <div class="key-infos-container">
            <div class="main-tags"><span class="info-tag tag-contract">${contractText}</span></div>
            <div class="secondary-pills">${dateHtml} ${diplomaHtml}</div>
        </div>
        <div class="detail-section">
            <h3 class="section-title">Description du poste</h3>
            <div class="formatted-text">${offer.offerDescription || "Non spécifiée."}</div>
        </div>
        ${stationsHtml}
      `;

    const mapBtn = body.querySelector("#btn-show-stations-map");
    if (mapBtn) {
      mapBtn.addEventListener("click", () => {
        this.hide();
        if (this.onShowStationsOnMap) {
          this.onShowStationsOnMap(stations);
        }
      });
    }
  }

  /**
   * Crée et affiche une liste d'offres pour une entreprise donnée dans un overlay indépendant.
   * Utilisé lorsqu'un marqueur sur la carte contient plusieurs offres.
   * Gère sa propre animation de sortie (fade-out) et permet de basculer vers le détail
   * d'une offre spécifique via un callback.
   *
   * @param {Object} companyData - Données globales de l'entreprise.
   * @param {Array<Object>} offers - Tableau des offres d'emploi associées.
   * @param {Function} onSelectOffer - Fonction appelée lorsqu'une offre de la liste est cliquée.
   */
  openOfferList(companyData, offers, onSelectOffer) {
    const existingModal = document.getElementById("olm-modal-overlay");
    if (existingModal) existingModal.remove();

    let filteredOffers = offers;
    const searchFilters = this.searchComponent
      ? this.searchComponent.filters
      : null;
    let isFiltered = false;

    if (
      searchFilters &&
      searchFilters.text &&
      searchFilters.searchType === "offer"
    ) {
      const search = searchFilters.text.toLowerCase();
      filteredOffers = offers.filter((o) => {
        const titleMatch = o.title && o.title.toLowerCase().includes(search);
        const descMatch =
          o.offerDescription &&
          o.offerDescription.toLowerCase().includes(search);
        return titleMatch || descMatch;
      });
      isFiltered = true;
    }

    const overlay = document.createElement("div");
    overlay.id = "olm-modal-overlay";
    overlay.className = "olm-overlay";

    const count = filteredOffers.length;
    const s = count > 1 ? "s" : "";

    let sectorHtml = "";
    if (companyData.sector) {
      const sec = companyData.sector.section || companyData.sector.label;
      if (sec && sec !== "Non renseigné") {
        sectorHtml = `<span class="olm-sector">${sec}</span>`;
      }
    }

    let listContentHtml = "";
    if (count === 0 && isFiltered) {
      listContentHtml = `<div class="olm-no-results">Aucune offre ne correspond à "${searchFilters.text}" pour cette entreprise.</div>`;
    } else {
      listContentHtml = filteredOffers
        .map((o, i) => {
          const type = Array.isArray(o.contractType)
            ? o.contractType[0]
            : o.contractType || "Contrat";

          return `
            <div class="olm-item" data-index="${i}">
                <div class="olm-item-info">
                    <span class="olm-item-title">${o.title}</span>
                    <span class="olm-item-contract">${type}</span>
                </div>
                <i class="fas fa-chevron-right olm-chevron"></i>
            </div>
            `;
        })
        .join("");
    }

    const countStyle = isFiltered
      ? 'style="color: #e67e22; font-weight: bold;"'
      : "";
    const filterText = isFiltered ? "(filtré)" : "";

    overlay.innerHTML = `
      <div class="olm-content">
        <div class="olm-header">
            <div class="olm-title-group">
                <h3 class="olm-company-name">${
                  companyData.company || "Entreprise"
                }</h3>
                <div class="olm-subtitle">
                    ${sectorHtml}
                    <span class="olm-count" ${countStyle}>${count} poste${s} disponible${s} ${filterText}</span>
                </div>
            </div>
            <button class="olm-close-btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="olm-body">
            <div class="olm-list-container">
                ${listContentHtml}
            </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const closeModal = (keepScroll = false) => {
      overlay.classList.add("fade-out");
      setTimeout(() => {
        overlay.remove();
        if (!keepScroll) {
          document.body.style.overflow = "";
        }
      }, 200);
    };

    overlay
      .querySelector(".olm-close-btn")
      .addEventListener("click", () => closeModal(false));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(false);
    });

    overlay.querySelectorAll(".olm-item").forEach((el) => {
      el.addEventListener("click", () => {
        const index = parseInt(el.dataset.index, 10);
        closeModal(true);
        setTimeout(() => {
          onSelectOffer(filteredOffers[index]);
        }, 150);
      });
    });
  }

  /**
   * Méthode privée.
   * Attache les écouteurs d'événements aux boutons du pied de page de la modale.
   * Gère la sécurité du bouton itinéraire (vérification du statut désactivé) et
   * la logique d'ajout/suppression des favoris au clic.
   * @private
   */
  #setupFooterEvents() {
    const routeBtn = this.container.querySelector(".btn-route");
    if (routeBtn) {
      const newBtn = routeBtn.cloneNode(true);
      routeBtn.parentNode.replaceChild(newBtn, routeBtn);

      newBtn.addEventListener("click", (e) => {
        if (newBtn.disabled || newBtn.classList.contains("disabled-btn")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.onItineraryCallback && this.currentOffer) {
          this.hide();
          this.onItineraryCallback(this.currentOffer);
        }
      });
    }

    const favBtn = this.container.querySelector("#footer-fav-btn");
    if (favBtn) {
      favBtn.addEventListener("click", () => {
        if (this.favManager.isFavorite(this.currentOffer.offerId)) {
          this.favManager.removeFavorite(this.currentOffer.offerId);
        } else {
          this.favManager.addFavorite(this.currentOffer);
        }
        this.#updateFavoriteBtnState();
      });
    }
  }

  /**
   * Méthode privée.
   * Synchronise l'aspect visuel du bouton favori de la modale avec l'état réel
   * présent dans le FavManager. Modifie l'icône, la couleur et le texte (Favori / Retiré).
   * @private
   */
  #updateFavoriteBtnState() {
    const btn = this.container.querySelector("#footer-fav-btn");
    if (!btn || !this.currentOffer) return;
    const icon = btn.querySelector("i");

    if (this.favManager.isFavorite(this.currentOffer.offerId)) {
      icon.className = "fas fa-heart";
      btn.classList.add("is-active");
    } else {
      icon.className = "far fa-heart";
      btn.classList.remove("is-active");
    }
  }

  /**
   * Définit le callback à appeler lorsque l'utilisateur demande le calcul
   * d'un itinéraire vers l'offre affichée.
   * @param {Function} callback - Fonction recevant l'offre sélectionnée en paramètre.
   */
  setOnItineraryClick(callback) {
    this.onItineraryCallback = callback;
  }
  
  /**
   * Exporte une offre individuelle dans le format spécifié
   * @param {Object} offer - L'offre à exporter
   * @param {Object} companyInfo - Informations sur l'entreprise
   * @param {string} format - Le format d'export ('txt', 'json', ou 'csv')
   * @private
   */
  #exportOffer(offer, companyInfo, format = 'txt') {
    if (!offer) return;
    
    const companyName = companyInfo?.company || offer.company || "Entreprise";
    const offerData = [{
      companyName: companyName,
      offerName: offer.title,
      applyUrl: offer.applyUrl || ""
    }];
    
    let content, mimeType, extension;
    
    switch (format) {
      case 'txt':
        content = `Nom de l'entreprise : ${offerData[0].companyName}\n` +
                  `Nom de l'offre : ${offerData[0].offerName}\n` +
                  `Url pour postuler : ${offerData[0].applyUrl}\n`;
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'json':
        content = JSON.stringify(offerData, null, 2);
        mimeType = 'application/json';
        extension = 'json';
        break;
      case 'csv':
        const headers = ['companyName', 'offerName', 'applyUrl'];
        const rows = offerData.map(data =>
          `"${data.companyName.replace(/"/g, '""')}","${data.offerName.replace(/"/g, '""')}","${data.applyUrl.replace(/"/g, '""')}"`
        );
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
    link.download = `offre-${offerData[0].offerName.substring(0, 30).replace(/[^a-z0-9]/gi, '_')}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

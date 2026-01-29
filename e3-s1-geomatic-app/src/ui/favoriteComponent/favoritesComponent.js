/**
 * Composant d'interface utilisateur gérant l'affichage et l'interaction avec la liste des favoris.
 * Se présente sous la forme d'un widget extensible/rétractable (accordéon).
 * S'abonne aux changements du gestionnaire de favoris pour mettre à jour la vue en temps réel.
 * * Dépendances :
 * @param {string} parentId - L'ID de l'élément DOM parent où le widget sera injecté.
 * @param {Object} favManager - Instance de FavoritesManager pour la gestion des données.
 */
export class FavoritesComponent {
  constructor(parentId, favManager) {
    this.parent = document.getElementById(parentId);
    this.favManager = favManager;
    this.isExpanded = false;
    this.element = null;

    this.favorites = [];

    this.onExpand = null;
    this.onCollapse = null;
    this.onItemClick = null;
  }

  /**
   * Construit la structure DOM du widget, l'injecte dans le parent,
   * configure les événements UI et initialise l'abonnement aux mises à jour des favoris.
   * @returns {void}
   */
  init() {
    this.element = document.createElement("div");
    this.element.className = "favorites-widget";

    this.element.innerHTML = `
        <div class="fav-header">
            <button class="fav-icon-btn"><i class="far fa-star"></i></button>
            <span class="fav-title">Mes Favoris (<span id="fav-count">0</span>)</span>
            
            <div class="header-actions">
                <!-- Bouton d'export avec menu déroulant -->
                <div class="fav-export-menu">
                    <button class="btn-export" title="Exporter les favoris">
                        <i class="fas fa-download"></i> Exporter
                    </button>
                    <div class="fav-export-dropdown">
                        <button class="export-option" data-format="txt">Format texte (.txt)</button>
                        <button class="export-option" data-format="json">JSON</button>
                        <button class="export-option" data-format="csv">CSV</button>
                    </div>
                </div>
                <button class="fav-close-btn"><i class="fas fa-times"></i></button>
            </div>
        </div>
        
        <div class="fav-content">
            <div class="fav-list"></div>
        </div>
    `;
    this.parent.appendChild(this.element);

    this.#setupEvents();

    this.#renderList(this.favManager.getFavorites());

    this.favManager.subscribe((newFavorites) => {
      this.#renderList(newFavorites);
    });
  }

  /**
   * Méthode privée. Configure les écouteurs d'événements pour l'ouverture/fermeture du widget
   * au clic sur le header ou le bouton de fermeture.
   * @returns {void}
   * @private
   */
  #setupEvents() {
    const header = this.element.querySelector(".fav-header");
    const closeBtn = this.element.querySelector(".fav-close-btn");

    header.addEventListener("click", (e) => {
      if (e.target.closest(".fav-close-btn")) return;

      if (!this.isExpanded) this.expand();
      else this.collapse();
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.collapse();
    });

    const exportBtn = this.element.querySelector(".btn-export");
    const exportMenu = this.element.querySelector(".fav-export-menu");
    const exportOptions = this.element.querySelectorAll(".export-option");

    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("active");
    });

    exportOptions.forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const format = e.target.dataset.format;
        this.#exportFavorites(format);
        exportMenu.classList.remove("active");
      });
    });

    document.addEventListener("click", (e) => {
      if (exportMenu && !exportMenu.contains(e.target)) {
        exportMenu.classList.remove("active");
      }
    });
  }

  /**
   * Exporte les favoris dans le format spécifié
   * @param {string} format - Le format d'export ('txt', 'json', ou 'csv')
   * @private
   */
  #exportFavorites(format) {
    const favorites = this.favManager.getFavorites();

    if (favorites.length === 0) return;

    let content, mimeType, extension;

    switch (format) {
      case "txt":
        content = favorites
          .map(
            (fav) =>
              `Nom de l'entreprise : ${fav.company}\n` +
              `Nom de l'offre : ${fav.title}\n` +
              `Url pour postuler : ${fav.applyUrl}\n`,
          )
          .join("\n");
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "json":
        const exportData = favorites.map((fav) => ({
          companyName: fav.company,
          offerName: fav.title,
          applyUrl: fav.applyUrl,
        }));
        content = JSON.stringify(exportData, null, 2);
        mimeType = "application/json";
        extension = "json";
        break;
      case "csv":
        const headers = ["companyName", "offerName", "applyUrl"];
        const rows = favorites.map(
          (fav) =>
            `"${fav.company.replace(/"/g, '""')}","${fav.title.replace(/"/g, '""')}","${fav.applyUrl.replace(/"/g, '""')}"`,
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
    link.download = `favoris.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Déploie le widget pour afficher la liste des favoris.
   * Met à jour la classe CSS et déclenche le callback onExpand si défini.
   * @returns {void}
   */
  expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.element.classList.add("expanded");

    this.#renderList();

    if (this.onExpand) this.onExpand();
  }

  /**
   * Réduit le widget pour ne montrer que le header.
   * Met à jour la classe CSS et déclenche le callback onCollapse si défini.
   * @returns {void}
   */
  collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.element.classList.remove("expanded");

    if (this.onCollapse) this.onCollapse();
  }

  /**
   * Méthode privée. Génère le HTML de la liste des favoris et met à jour le DOM.
   * Gère l'état vide, l'icône de l'étoile (active/inactive) et attache les événements
   * sur chaque élément de la liste (suppression, lien externe, clic détail).
   * @param {Array<Object>|null} newList - Nouvelle liste de favoris (optionnel).
   * @returns {void}
   * @private
   */
  #renderList(newList = null) {
    if (newList) {
      this.favorites = newList;
    }

    const listContainer = this.element.querySelector(".fav-list");
    const titleCount = this.element.querySelector("#fav-count");
    const starIcon = this.element.querySelector(".fav-icon-btn i");

    if (this.favorites.length > 0) {
      starIcon.className = "fas fa-star";
      starIcon.style.color = "#f1c40f";
    } else {
      starIcon.className = "far fa-star";
      starIcon.style.color = "";
    }

    if (titleCount) titleCount.textContent = this.favorites.length;

    if (this.favorites.length === 0) {
      listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="far fa-star"></i>
                    <p>Aucun favori pour le moment.</p>
                </div>`;
      return;
    }

    const html = this.favorites
      .map(
        (fav) => `
            <div class="fav-item" data-id="${fav.id}">
                <div class="fav-info">
                    <span class="fav-job-title" title="${fav.title}">${fav.title}</span>
                    <div class="fav-company">
                        <i class="fas fa-building" style="font-size:0.7rem; margin-right:5px;"></i> ${fav.company}
                    </div>
                </div>
                <div class="fav-actions">
                    <button class="action-btn btn-view" title="Voir l'offre" data-url="${fav.applyUrl}">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    <button class="action-btn btn-delete" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `,
      )
      .join("");

    listContainer.innerHTML = html;

    listContainer.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = e.target.closest(".fav-item");
        const id = item.dataset.id;

        this.favManager.removeFavorite(id);
      });
    });

    listContainer.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const url = btn.dataset.url;
        if (url && url !== "undefined" && url !== "null") {
          window.open(url, "_blank");
        } else {
          alert("Lien de l'offre non disponible.");
        }
      });
    });

    this.element.querySelectorAll(".fav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".action-btn")) return;

        const id = item.dataset.id;
        if (this.onItemClick) {
          this.onItemClick(id);
        }
      });
    });
  }
}

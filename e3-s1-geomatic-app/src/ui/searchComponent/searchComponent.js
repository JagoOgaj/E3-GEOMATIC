/**
 * Composant de recherche et de filtrage des entreprises.
 * Se présente sous forme d'un volet dépliable contenant une barre de recherche textuelle
 * et un ensemble de filtres avancés (secteur, taille, rayon, score de transport).
 * Interagit directement avec le DataManager pour filtrer les données et le MapManager pour l'affichage.
 *
 * Dépendances :
 * @param {string} parentId - L'ID de l'élément DOM parent (ex: 'ui-layer').
 * @param {Object} mapManager - Instance du gestionnaire de carte (pour le rayon et les marqueurs).
 * @param {Object} dataManager - Instance du gestionnaire de données (pour le filtrage réel).
 */
export class SearchComponent {
  constructor(parentId, mapManager, dataManager) {
    this.parent = document.getElementById(parentId);
    this.dataManager = dataManager;
    this.mapManager = mapManager;
    this.isExpanded = false;
    this.element = null;
    this.animTimer = null;

    this.onExpand = null;
    this.onCollapse = null;
    this.onMarkerClickCallback = null;

    this.filters = {
      sectors: [],
      size: [],
      radius: 100,
      score: 0,
      transportModes: [],
      mode: "include",
      text: "",
      searchType: "company",
      userPosition: null,
    };

    this.debounceSearch = null;
  }

  /**
   * Définit le callback à exécuter lorsqu'un marqueur est cliqué sur la carte
   * suite à une recherche ou un filtrage.
   * @param {Function} callback - La fonction de callback.
   * @returns {void}
   */
  setOnMarkerClick(callback) {
    this.onMarkerClickCallback = callback;
  }

  /**
   * Initialise le widget de recherche.
   * Crée la structure HTML de base (barre de recherche), l'ajoute au DOM,
   * initialise la position utilisateur si disponible et configure les événements de base.
   * @returns {void}
   */
  init() {
    this.element = document.createElement("div");
    this.element.className = "search-widget";

    this.element.innerHTML = `
            <div class="widget-header">
                <button class="search-icon-btn">
                    <i class="fas fa-search"></i>
                </button>
                <input type="text" class="search-input" placeholder="Rechercher une entreprise...">
                <button class="close-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="widget-content">
                <div id="dynamic-content-area"></div>
            </div>
        `;
    this.parent.appendChild(this.element);

    if (this.mapManager && this.mapManager.userPosition) {
      this.filters.userPosition = this.mapManager.userPosition;
    }

    this.#setupEvents();
  }

  /**
   * Méthode privée. Configure les écouteurs d'événements principaux :
   * - Ouverture/Fermeture du widget.
   * - Gestion du clic extérieur pour fermer les listes déroulantes.
   * - Saisie dans la barre de recherche avec Debounce.
   * @returns {void}
   * @private
   */
  #setupEvents() {
    const header = this.element.querySelector(".widget-header");
    const closeBtn = this.element.querySelector(".close-btn");
    const searchInput = this.element.querySelector(".search-input");

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".custom-select")) {
        const openSelects = this.element.querySelectorAll(
          ".custom-select.open",
        );
        openSelects.forEach((s) => s.classList.remove("open"));
      }
    });

    header.addEventListener("click", (e) => {
      if (!this.isExpanded && !e.target.closest(".close-btn")) this.expand();
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.collapse();
    });

    searchInput.addEventListener("input", (e) => {
      clearTimeout(this.debounceSearch);
      this.debounceSearch = setTimeout(() => {
        this.filters.text = e.target.value;
        this.#applyFilters();
      }, 300);
    });
  }

  /**
   * Méthode interne asynchrone qui applique l'ensemble des filtres courants aux données.
   * Récupère le GeoJSON filtré via le DataManager et demande au MapManager de mettre à jour la carte.
   * Met également à jour l'indicateur visuel (badge) si des filtres sont actifs.
   * @returns {Promise<void>}
   * @private
   */
  async #applyFilters() {
    // Vérifier que toutes les dépendances sont initialisées
    if (!this.dataManager || !this.mapManager) {
      return;
    }

    // Forcer l'initialisation des offres si ce n'est pas déjà fait
    if (!this.dataManager.offersCache) {
      // Appeler la méthode privée via une méthode publique existante
      try {
        // On appelle getOffersByStorageId avec un ID qui n'existe pas
        // Cela va déclencher le chargement du cache sans erreur
        await this.dataManager.getOffersByStorageId("");
      } catch (e) {
        // Ignorer les erreurs d'initialisation
      }
    }

    if (this.mapManager && this.mapManager.userPosition) {
      this.filters.userPosition = this.mapManager.userPosition;
    }

    this.#updateBadge();

    const filteredGeoJson = await this.dataManager.filterCompanies(
      this.filters,
    );

    // Mettre à jour le composant de résultats
    if (window.uiManager && window.uiManager.resultsComponent) {
      window.uiManager.resultsComponent.updateResults(filteredGeoJson, this.filters.text);
    }

    this.mapManager.updateMarkers(filteredGeoJson, (companyProps) => {
      if (this.onMarkerClickCallback) {
        this.onMarkerClickCallback(companyProps);
      }
    });
  }

  /**
   * Méthode privée. Met à jour l'icône de recherche pour indiquer visuellement
   * si des filtres sont actifs (effet de pulsation).
   * @returns {void}
   * @private
   */
  #updateBadge() {
    let count = 0;
    if (this.filters.text) count++;
    if (this.filters.sectors.length > 0) count++;
    if (this.filters.size.length > 0) count++;
    if (this.filters.radius < 100) count++;
    if (this.filters.score > 0) count++;
    if (this.filters.transportModes.length > 0) count++;

    const icon = this.element.querySelector(".search-icon-btn i");

    if (count > 0) {
      icon.classList.add("pulse-active");
    } else {
      icon.classList.remove("pulse-active");
    }
  }

  /**
   * Méthode privée. Met à jour l'affichage du nombre de résultats.
   * @param {number} count - Le nombre de résultats.
   * @returns {void}
   * @private
   */
  #updateResultsCount(count) {
    const resultsCountContainer = this.element.querySelector(".results-count-container");
    const resultsCountText = this.element.querySelector("#results-count-text");
    
    if (resultsCountContainer && resultsCountText) {
      if (count > 0) {
        resultsCountText.textContent = `${count} résultat${count > 1 ? 's' : ''}`;
        resultsCountContainer.style.display = "block";
      } else {
        resultsCountContainer.style.display = "none";
      }
    }
  }

  /**
   * Méthode publique pour mettre à jour le nombre de résultats affiché.
   * @param {number} count - Le nombre de résultats.
   * @returns {void}
   */
  updateResultsCount(count) {
    this.#updateResultsCount(count);
  }

  /**
   * Déploie le widget de recherche pour afficher les filtres avancés.
   * Active le mode "Focus" global et génère le DOM interne des filtres dynamiquement.
   * @returns {void}
   */
  expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.element.classList.add("expanded");

    if (!document.body.classList.contains("radius-tuning")) {
      document.body.classList.add("focus-mode");
    }

    const input = this.element.querySelector(".search-input");
    input.value = this.filters.text || "";
    setTimeout(() => input.focus(), 300);

    this.#buildInternalDOM();

    if (this.animTimer) clearTimeout(this.animTimer);
    this.animTimer = setTimeout(() => {
      const content = this.element.querySelector(".widget-content");
      if (content) content.classList.add("visible");
    }, 400);

    const radiusSection = this.element.querySelector(".radius-wrapper");
    const radiusInput = this.element.querySelector("#radius-range");

    const hasPosition =
      this.mapManager.userPosition && this.mapManager.userPosition.lat;

    if (!hasPosition) {
      if (radiusSection) {
        radiusSection.classList.add("disabled-section");

        radiusSection.title =
          "Veuillez activer votre localisation pour utiliser ce filtre";
      }
      if (radiusInput) {
        radiusInput.disabled = true;
      }
    } else {
      if (radiusSection) radiusSection.classList.remove("disabled-section");
      if (radiusInput) radiusInput.disabled = false;
    }

    if (this.onExpand) this.onExpand();
    
    // Appliquer les filtres initiaux pour afficher le nombre de résultats
    this.#applyFilters();
  }

  /**
   * Replie le widget de recherche et nettoie l'interface.
   * Désactive le mode "Focus", nettoie la prévisualisation du rayon et vide le contenu dynamique.
   * @returns {void}
   */
  collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;

    const content = this.element.querySelector(".widget-content");
    if (content) content.classList.remove("visible");

    this.element.classList.remove("expanded");
    document.body.classList.remove("focus-mode");
    document.body.classList.remove("radius-tuning");
    this.element.classList.remove("radius-active");
    this.mapManager.clearRadiusPreview();

    this.element.querySelector(".search-input").blur();

    setTimeout(() => {
      if (!this.isExpanded)
        this.element.querySelector("#dynamic-content-area").innerHTML = "";
    }, 600);

    if (this.onCollapse) this.onCollapse();
  }

  /**
   * Méthode privée. Construit dynamiquement le DOM des filtres.
   * Gère le tri alphabétique pour les secteurs et numérique pour les tailles.
   * @returns {void}
   */
  #buildInternalDOM() {
    const container = this.element.querySelector("#dynamic-content-area");
    const options = this.dataManager.extractFilterOptions();

    const sortedSectors = [...options.sectors].sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" }),
    );

    const sectorOptions = sortedSectors
      .map((s) => {
        const isSelected = this.filters.sectors.includes(s);
        return `<div class="select-option ${
          isSelected ? "selected-opt" : ""
        }" data-type="sector" data-val="${s}">
                    ${s} ${isSelected ? '<i class="fas fa-check"></i>' : ""}
                  </div>`;
      })
      .join("");

    const specialLabels = [
      "Etablissement non employeur",
      "Non diffusé",
      "Non renseigné",
      "0 salarié",
    ];

    const specialSizesFound = options.sizes.filter((s) =>
      specialLabels.some((label) =>
        s.toLowerCase().includes(label.toLowerCase()),
      ),
    );

    const numericSizes = options.sizes.filter(
      (s) => !specialSizesFound.includes(s),
    );

    numericSizes.sort((a, b) => {
      const extractNumber = (str) => {
        const match = str.match(/(\d+)/);
        return match ? parseInt(match[0], 10) : 0;
      };
      return extractNumber(a) - extractNumber(b);
    });

    let specialGroupHtml = "";
    if (specialSizesFound.length > 0) {
      const isGroupSelected = specialSizesFound.every((val) =>
        this.filters.size.includes(val),
      );
      specialGroupHtml = `<div class="select-option ${
        isGroupSelected ? "selected-opt" : ""
      }" data-type="size" data-val="__SPECIAL_GROUP__">
          Inconnu / Non employeur ${
            isGroupSelected ? '<i class="fas fa-check"></i>' : ""
          }
      </div>`;
    }

    const numericSizesHtml = numericSizes
      .map((s) => {
        const isSelected = this.filters.size.includes(s);
        return `<div class="select-option ${
          isSelected ? "selected-opt" : ""
        }" data-type="size" data-val="${s}">
                  ${s} ${isSelected ? '<i class="fas fa-check"></i>' : ""}
                </div>`;
      })
      .join("");

    const sizeOptionsHtml = specialGroupHtml + numericSizesHtml;

    const sectorLabel =
      this.filters.sectors.length > 0
        ? `${this.filters.sectors.length} sélectionné(s)`
        : "Choisir un secteur...";

    let sizeLabel = "Toutes tailles";
    if (this.filters.size.length > 0) {
      sizeLabel = `${this.filters.size.length} sélectionné(s)`;
    }

    const radiusVal = this.filters.radius;
    const radiusText = radiusVal >= 100 ? "Toute la France" : `${radiusVal} km`;
    const radiusColor = radiusVal >= 100 ? "#e74c3c" : "";

    const scoreVal = this.filters.score;
    const scoreText = scoreVal === 0 ? "Indifférent" : `${scoreVal}/5`;

    const modes = ["BUS", "METRO", "TRAM", "TRAIN"];
    const transportCheckboxes = modes
      .map((m) => {
        const checked = this.filters.transportModes.includes(m)
          ? "checked"
          : "";
        return `
            <label class="transport-checkbox">
                <input type="checkbox" value="${m}" ${checked}>
                <span class="checkmark">${m}</span>
            </label>
        `;
      })
      .join("");

    container.innerHTML = `
            <div class="search-type-switch" style="display:flex; background:#f1f3f5; padding:4px; border-radius:8px; margin-bottom:15px;">
                <button class="type-btn ${
                  this.filters.searchType === "company" ? "active" : ""
                }" data-type="company" style="flex:1; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.9rem;">Entreprise</button>
                <button class="type-btn ${
                  this.filters.searchType === "offer" ? "active" : ""
                }" data-type="offer" style="flex:1; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.9rem;">Offre</button>
            </div>

            <details class="widget-section" id="section-filters" open>
                <summary>Critères de recherche</summary>
                <div class="section-body">
                    
                    <div class="form-group">
                        <label>Secteur d'activité</label>
                        <div class="custom-select" id="sector-select">
                            <div class="select-trigger ${
                              this.filters.sectors.length > 0 ? "selected" : ""
                            }">${sectorLabel}</div>
                            <div class="select-options">${sectorOptions}</div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Taille d'entreprise</label>
                        <div class="custom-select" id="size-select">
                            <div class="select-trigger ${
                              this.filters.size.length > 0 ? "selected" : ""
                            }">${sizeLabel}</div>
                            <div class="select-options">
                                <div class="select-option" data-type="size" data-val="">Toutes tailles (Reset)</div>
                                ${sizeOptionsHtml}
                            </div>
                        </div>
                    </div>

                    <div class="form-group radius-wrapper" style="margin-top:20px;">
                        <div class="range-header">
                            <label>Rayon de recherche</label>
                            <span id="radius-val" class="highlight-val" style="color:${radiusColor}">${radiusText}</span>
                        </div>
                        <input type="range" id="radius-range" class="styled-range" min="1" max="100" value="${radiusVal}">
                        <div class="range-labels">
                           <span>1km</span>
                           <span>∞</span>
                        </div>
                    </div>
                </div>
            </details>

            <details class="widget-section" style="margin-top:10px;">
                <summary>Accès & Transports</summary>
                <div class="section-body">
                    <div class="form-group">
                        <div class="range-header">
                            <label>Score Desservance (Min.)</label>
                            <span id="score-val" class="highlight-val">${scoreText}</span>
                        </div>
                        <input type="range" id="score-range" class="styled-range gradient-range" min="0" max="5" step="0.5" value="${scoreVal}">
                    </div>
                    
                    <div class="form-group" style="margin-top:15px;">
                        <label style="margin-bottom:8px; display:block; font-size:0.85rem; font-weight:600; color:#34495e;">Modes à proximité :</label>
                        <div class="transport-modes-grid" style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${transportCheckboxes}
                        </div>
                    </div>
                </div>
            </details>
            
            <div class="results-count-container" style="padding: 15px; text-align: center; font-size: 0.9rem; color: #3498db; cursor: pointer; border-top: 1px solid #eee; margin-top: 10px; display: none;">
                <span id="results-count-text"></span>
            </div>
        `;

    this.#bindDynamicEvents(container);

    const radiusSection = container.querySelector(".radius-wrapper");
    const radiusInput = container.querySelector("#radius-range");
    const hasPosition =
      this.mapManager.userPosition && this.mapManager.userPosition.lat;

    if (!hasPosition) {
      if (radiusSection) radiusSection.classList.add("disabled-section");
      if (radiusInput) radiusInput.disabled = true;
    }
  }

  /**
   * Méthode privée. Attache les événements sans reconstruire le DOM au clic.
   * Met à jour visuellement l'élément cliqué pour éviter le "saut".
   * @param {HTMLElement} container - Le conteneur DOM des filtres.
   * @returns {void}
   */
  #bindDynamicEvents(container) {
    const typeBtns = container.querySelectorAll(".type-btn");
    typeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        typeBtns.forEach((b) => {
          b.classList.remove("active");
          b.style.background = "transparent";
          b.style.color = "#7f8c8d";
        });
        btn.classList.add("active");
        btn.style.background = "#ffffff";
        btn.style.color = "#2c3e50";
        btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
        this.filters.searchType = btn.dataset.type;
        const input = this.element.querySelector(".search-input");
        input.placeholder =
          this.filters.searchType === "company"
            ? "Rechercher une entreprise..."
            : "Rechercher un poste...";
        this.#applyFilters();
      });
    });

    const activeBtn = container.querySelector(
      `.type-btn[data-type="${this.filters.searchType}"]`,
    );
    if (activeBtn) {
      activeBtn.style.background = "#ffffff";
      activeBtn.style.color = "#2c3e50";
      activeBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    }

    const allSelects = container.querySelectorAll(".custom-select");
    const specialLabels = [
      "Etablissement non employeur",
      "Non diffusé",
      "Non renseigné",
      "0 salarié",
    ];

    allSelects.forEach((select) => {
      const trigger = select.querySelector(".select-trigger");

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        allSelects.forEach((other) => {
          if (other !== select) other.classList.remove("open");
        });
        select.classList.toggle("open");
      });

      select.querySelectorAll(".select-option").forEach((opt) => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = opt.dataset.val;
          const type = opt.dataset.type;

          let isSelected = false;

          if (type === "size" && val === "") {
            this.filters.size = [];
            isSelected = false;
          } else if (type === "size" && val === "__SPECIAL_GROUP__") {
            const options = this.dataManager.extractFilterOptions();
            const specialValues = options.sizes.filter((s) =>
              specialLabels.some((label) =>
                s.toLowerCase().includes(label.toLowerCase()),
              ),
            );

            const allSelected = specialValues.every((v) =>
              this.filters.size.includes(v),
            );

            if (allSelected) {
              this.filters.size = this.filters.size.filter(
                (v) => !specialValues.includes(v),
              );
              isSelected = false;
            } else {
              specialValues.forEach((v) => {
                if (!this.filters.size.includes(v)) this.filters.size.push(v);
              });
              isSelected = true;
            }
          } else {
            const targetArray =
              type === "sector" ? this.filters.sectors : this.filters.size;

            const index = targetArray.indexOf(val);
            if (index === -1) {
              targetArray.push(val);
              isSelected = true;
            } else {
              targetArray.splice(index, 1);
              isSelected = false;
            }
          }

          if (type === "size" && val === "") {
            select.querySelectorAll(".select-option").forEach((o) => {
              o.classList.remove("selected-opt");
              const icon = o.querySelector("i");
              if (icon) icon.remove();
            });
          } else {
            if (isSelected) {
              opt.classList.add("selected-opt");
              if (!opt.querySelector("i")) {
                opt.insertAdjacentHTML(
                  "beforeend",
                  '<i class="fas fa-check"></i>',
                );
              }
            } else {
              opt.classList.remove("selected-opt");
              const icon = opt.querySelector("i");
              if (icon) icon.remove();
            }
          }

          const targetArray =
            type === "sector" ? this.filters.sectors : this.filters.size;
          if (targetArray.length === 0) {
            trigger.textContent =
              type === "sector" ? "Choisir un secteur..." : "Toutes tailles";
            trigger.classList.remove("selected");
          } else {
            trigger.textContent = `${targetArray.length} sélectionné(s)`;
            trigger.classList.add("selected");
          }

          this.#applyFilters();
        });
      });
    });

    const radiusInput = container.querySelector("#radius-range");
    const radiusLabel = container.querySelector("#radius-val");
    const filterSection = container.querySelector("#section-filters");

    radiusInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value);
      if (val >= 100) {
        radiusLabel.textContent = "Toute la France";
        radiusLabel.style.color = "#e74c3c";
        this.mapManager.clearRadiusPreview();
      } else {
        radiusLabel.textContent = `${val} km`;
        radiusLabel.style.color = "";
        this.mapManager.previewRadius(val);
      }
      this.element.classList.add("radius-active");
      filterSection.classList.add("is-radius-section");
      document.body.classList.remove("focus-mode");
      document.body.classList.add("radius-tuning");
      this.filters.radius = val;
      this.#applyFilters();
    });

    const onRadiusChange = () => {
      const val = parseInt(radiusInput.value);
      this.element.classList.remove("radius-active");
      filterSection.classList.remove("is-radius-section");
      document.body.classList.remove("radius-tuning");
      document.body.classList.add("focus-mode");
      this.mapManager.clearRadiusPreview();
      if (val >= 100) {
        this.mapManager.map.flyToBounds([
          [51.1, -5.2],
          [41.3, 9.6],
        ]);
      }
      this.filters.radius = val;
      this.#applyFilters();
    };
    radiusInput.addEventListener("change", onRadiusChange);

    const scoreInput = container.querySelector("#score-range");
    const scoreLabel = container.querySelector("#score-val");
    scoreInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      scoreLabel.textContent = val === 0 ? "Indifférent" : `${val}/5`;
    });
    scoreInput.addEventListener("change", (e) => {
      this.filters.score = parseFloat(e.target.value);
      this.#applyFilters();
    });

    const tCheckboxes = container.querySelectorAll(".transport-checkbox input");
    tCheckboxes.forEach((cb) => {
      cb.addEventListener("change", () => {
        const val = cb.value;
        if (cb.checked) {
          this.filters.transportModes.push(val);
        } else {
          this.filters.transportModes = this.filters.transportModes.filter(
            (m) => m !== val,
          );
        }
        this.#applyFilters();
      });
   });
   
   // Ajouter l'écouteur d'événements pour le clic sur le compteur de résultats
   const resultsCountContainer = container.querySelector(".results-count-container");
   if (resultsCountContainer) {
     resultsCountContainer.addEventListener("click", () => {
       // Fermer le widget de recherche
       this.collapse();
       
       // Ouvrir le widget de résultats si disponible
       if (window.uiManager && window.uiManager.resultsComponent) {
         window.uiManager.resultsComponent.expand();
       }
     });
   }
 }
}

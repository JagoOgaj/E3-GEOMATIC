import { SearchComponent } from "../../ui/searchComponent/searchComponent.js";
import { ResultsComponent } from "../../ui/resultsComponent/resultsComponent.js";
import { FavoritesComponent } from "../../ui/favoriteComponent/favoritesComponent.js";
import { ModalComponent } from "../../ui/modalComponent/modalComponent.js";
import { NavigationComponent } from "../../ui/navigationComponent/navigationComponent.js";
import { TransportComponent } from "../../ui/transportComponent/transportComponent.js";
import { RouteDetailsComponent } from "../../ui/routeDetailsComponent/routeDetailsComponent.js";

/**
 * Orchestrateur principal de l'interface utilisateur.
 * Cette classe est responsable de l'instanciation, de l'initialisation et de la coordination
 * entre les différents widgets (Recherche, Résultats, Carte, Modales, etc.).
 * * Dépendances :
 * @param {Object} mapManager - Instance gérant la carte Leaflet.
 * @param {Object} favManager - Instance gérant les favoris.
 * @param {Object} dataManger - Instance gérant les données (GeoJSON, Offres).
 */
export class UIManager {
  constructor(mapManager, favManager, dataManger) {
    this.mapManager = mapManager;
    this.favManager = favManager;
    this.dataManger = dataManger;

    this.searchComponent = null;
    this.favoritesComponent = null;
    this.resultsComponent = null;
    this.jobModal = null;
    this.navComponent = null;
    this.transportComponent = null;
    this.routeComponent = null;
  }

  /**
   * Initialise tous les composants UI, les injecte dans le DOM et configure
   * les écouteurs d'événements pour la communication inter-widgets.
   * @returns {void}
   */
  init() {
    this.searchComponent = new SearchComponent(
      "ui-layer",
      this.mapManager,
      this.dataManger
    );
    this.favoritesComponent = new FavoritesComponent("ui-layer", this.favManager);
    this.resultsComponent = new ResultsComponent(
      "ui-layer",
      this.favManager,
      this.dataManger
    );
    this.jobModal = new ModalComponent(this.favManager);
    this.navComponent = new NavigationComponent("ui-layer", this.mapManager);
    this.routeComponent = new RouteDetailsComponent();
    this.transportComponent = new TransportComponent("ui-layer");

    this.searchComponent.init();
    this.favoritesComponent.init();
    this.resultsComponent.init();
    this.navComponent.init();
    this.jobModal.init();
    this.transportComponent.init();
    this.routeComponent.init();

    this.jobModal.onShowStationsOnMap = (stations) => {
      if (this.mapManager.displayStations) {
        this.mapManager.displayStations(stations);
      }

      this.transportComponent.show();

      if (this.searchComponent) this.searchComponent.collapse();
      if (this.favoritesComponent) this.favoritesComponent.collapse();
    };

    this.transportComponent.onClick = () => {
      if (this.mapManager.clearStations) {
        this.mapManager.clearStations();
      }
      this.transportComponent.hide();
    };

    this.setupFocusMode();
  }

  /**
   * Configure la logique du mode "Focus".
   * Lorsqu'un widget principal est étendu, les autres sont masqués automatiquement
   * et l'arrière-plan peut être flouté pour améliorer la lisibilité.
   * @returns {void}
   */
  setupFocusMode() {
    const widgets = [
      this.searchComponent,
      this.favoritesComponent,
      this.resultsComponent,
    ];

    widgets.forEach((widget) => {
      if (!widget) return;

      widget.onExpand = () => {
        widgets.forEach((w) => {
          if (w !== widget) {
            w.collapse();
            if (w.element) w.element.classList.add("widget-hidden");
          }
        });
        document.body.classList.add("focus-mode");
      };

      widget.onCollapse = () => {
        setTimeout(() => {
          if (widgets.every((w) => !w.isExpanded)) {
            document.body.classList.remove("focus-mode");

            widgets.forEach((w) => {
              if (w !== widget && w.element) {
                w.element.classList.remove("widget-hidden");
              }
            });
          }
        }, 200);
      };
    });
  }

  /**
   * Crée et affiche un bouton flottant permettant de quitter le mode itinéraire.
   * Ce bouton nettoie le tracé sur la carte et ferme le widget de détails du trajet.
   * @returns {void}
   */
  createCloseRouteButton() {
    let btn = document.getElementById("btn-close-route");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "btn-close-route";
      btn.innerHTML = '<i class="fas fa-times"></i> Quitter itinéraire';
      btn.className = "floating-close-btn";
      document.body.appendChild(btn);

      btn.addEventListener("click", () => {
        this.mapManager.clearRoute();
        btn.style.display = "none";
        this.routeComponent.hide();
      });
    }
    btn.style.display = "block";
  }
}

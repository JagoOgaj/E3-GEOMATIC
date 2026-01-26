import { SearchComponent } from "../../ui/searchComponent/searchComponent.js";
import { ResultsComponent } from "../../ui/resultsComponent/resultsComponent.js";
import { FavoritesComponent } from "../../ui/favoriteComponent/favoritesComponent.js";
import { ModalComponent } from "../../ui/modalComponent/modalComponent.js";
import { NavigationComponent } from "../../ui/navigationComponent/navigationComponent.js";
import { TransportComponent } from "../../ui/transportComponent/transportComponent.js";
import { RouteDetailsComponent } from "../../ui/routeDetailsComponent/routeDetailsComponent.js";
import { UserLocationComponent } from "../../ui/userLocalisationComponent/userLocationComponent.js";

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
  this.userLocationComponent = null;
  
  // Suivi de l'état d'ouverture des composants
  this.activeComponent = null;
  
  // Suivi de l'état du widget de transport
  this.wasTransportWidgetVisible = true;
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
      this.dataManger,
    );
    this.favoritesComponent = new FavoritesComponent(
      "ui-layer",
      this.favManager,
    );
    this.resultsComponent = new ResultsComponent(
      "ui-layer",
      this.favManager,
      this.dataManger,
      this.searchComponent,
    );
    this.jobModal = new ModalComponent(this.favManager, this.mapManager, this.searchComponent);
    this.navComponent = new NavigationComponent("ui-layer", this.mapManager);
    this.routeComponent = new RouteDetailsComponent();
    this.transportComponent = new TransportComponent("ui-layer");

    this.userLocationComponent = new UserLocationComponent(
      this.mapManager,
      (pos) => {
        this.mapManager.setUserPosition(pos.lat, pos.lng);
        if (this.navComponent) {
          this.navComponent.updateButtonState();
        }
      },
    );

    this.userLocationComponent.onStartSelection = () => {
      this.toggleGlobalVisibility(false); 
    };

    this.userLocationComponent.onEndSelection = () => {
      this.toggleGlobalVisibility(true);
    };

    this.userLocationComponent.init();

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
  /**
  * Gère la visibilité des composants en fonction du composant actif
  * Cache les autres composants quand un composant est ouvert
  * @param {Object|null} activeWidget - Le composant actif ou null si aucun
  * @returns {void}
  */
 handleComponentVisibility(activeWidget) {
   const widgets = [
     this.searchComponent,
     this.favoritesComponent,
     this.resultsComponent,
   ];

   if (activeWidget) {
     // Un composant est actif, cacher les autres composants principaux
     widgets.forEach((widget) => {
       if (widget && widget !== activeWidget) {
         if (widget.element) {
           widget.element.classList.add("widget-hidden");
         }
       }
     });
     
     // Cacher également le widget de transport et mémoriser son état
     const transportWidget = document.querySelector('.transport-widget');
     if (transportWidget) {
       // Mémoriser si le widget était visible avant de le cacher
       this.wasTransportWidgetVisible = !transportWidget.classList.contains('widget-hidden');
       transportWidget.classList.add('widget-hidden');
     }
     
     // Cacher aussi les composants de navigation
     /* Finalement, on garde celui-ci visible:  if (this.navComponent) this.navComponent.hide(); */
     if (this.userLocationComponent) this.userLocationComponent.hide();
   } else {
     // Aucun composant actif, afficher tous les composants principaux
     widgets.forEach((widget) => {
       if (widget && widget.element) {
         widget.element.classList.remove("widget-hidden");
       }
     });
     
     // Réafficher le widget de transport seulement s'il était visible avant
     const transportWidget = document.querySelector('.transport-widget');
     if (transportWidget && this.wasTransportWidgetVisible) {
       transportWidget.classList.remove('widget-hidden');
     }
     
     // Réafficher les composants de navigation
     /* if (this.navComponent) this.navComponent.show(); */
     if (this.userLocationComponent) this.userLocationComponent.show();
   }
   
   // Mettre à jour l'état du composant actif
   this.activeComponent = activeWidget;
 }

  setupFocusMode() {
   const widgets = [
     this.searchComponent,
     this.favoritesComponent,
     this.resultsComponent,
   ];

   widgets.forEach((widget) => {
     if (!widget) return;

     widget.onExpand = () => {
       // Gérer la visibilité des composants
       this.handleComponentVisibility(widget);
       
       document.body.classList.add("focus-mode");
     };

     widget.onCollapse = () => {
       setTimeout(() => {
         if (widgets.every((w) => !w.isExpanded)) {
           document.body.classList.remove("focus-mode");
           
           // Réafficher tous les composants
           this.handleComponentVisibility(null);
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

  /**
   * Méthode utilitaire pour basculer la visibilité de toute l'interface
   * sauf la carte.
   * @param {boolean} isVisible - true pour afficher, false pour cacher
   */
  toggleGlobalVisibility(isVisible) {
    const method = isVisible ? "remove" : "add";

    const components = [
      this.searchComponent?.element,
      this.favoritesComponent?.element,
      this.resultsComponent?.element,
      this.navComponent?.element,
      document.getElementById("btn-close-route"),
    ];

    components.forEach((el) => {
      if (el) el.classList[method]("widget-hidden");
    });

    if (isVisible && this.userLocationComponent) {
      this.userLocationComponent.show();
    }

    if (isVisible && this.navComponent) {
      this.navComponent.updateButtonState();
    }
  }
}

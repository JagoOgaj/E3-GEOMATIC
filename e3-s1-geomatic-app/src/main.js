import { CONFIG } from "./internal/config/config.js";
import { DataManager } from "./internal/managers/dataManager.js";
import { FavoritesManager } from "./internal/managers/favoritesManager.js";
import { MapManager } from "./internal/managers/mapManager.js";
import { PathFinder } from "./internal/managers/pathFinder.js";
import { UIManager } from "./internal/managers/uiManager.js";

/**
 * Utilitaire asynchrone pour créer une pause dans l'exécution.
 * @param {number} ms - Le temps d'attente en millisecondes.
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Précharge l'ensemble des ressources définies dans la configuration (JSON, GeoJSON).
 * Met à jour l'interface du loader (barre de progression et texte) en temps réel.
 * Simule un léger délai pour des raisons esthétiques (UX).
 * @returns {Promise<void>}
 */
async function preloadResources() {
  const resources = Object.entries(CONFIG.paths);
  const total = resources.length;
  let loaded = 0;

  const progressBar = document.getElementById("loader-progress");
  const statusText = document.getElementById("loader-status");
  const detailText = document.getElementById("loader-detail");

  const updateProgress = (name) => {
    loaded++;
    const pct = Math.round((loaded / total) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (statusText) statusText.textContent = `Chargement des données (${pct}%)`;
    if (detailText) detailText.textContent = `Vérifié : ${name}`;
  };

  const promises = resources.map(async ([key, url]) => {
    try {
      await wait(300 + Math.random() * 500);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Erreur ${response.status}`);
      await response.blob();
      updateProgress(key);
    } catch (error) {
      if (detailText) {
        detailText.style.color = "#e74c3c";
        detailText.textContent = `Erreur sur ${key}`;
      }
      updateProgress(key);
    }
  });

  await Promise.all(promises);
}

/**
 * Point d'entrée principal de l'application (IIFE).
 * Orchestre le chargement, l'initialisation des managers et la gestion des événements globaux.
 */
(async () => {
  const loader = document.getElementById("app-loader");
  const detailText = document.getElementById("loader-detail");
  const statusText = document.getElementById("loader-status");

  try {
    await preloadResources();

    if (statusText) statusText.textContent = "Initialisation de la carte...";
    await wait(500);

    const dataManager = new DataManager();
    const favManager = new FavoritesManager();
    const mapManager = new MapManager("map");
    const pathFinder = new PathFinder();

    const isGeoLoaded = await dataManager.init();
    if (!isGeoLoaded)
      throw new Error("Impossible de charger le GeoJSON principal.");

    const uiManager = new UIManager(mapManager, favManager, dataManager);
    uiManager.init();
    uiManager.userLocationComponent.updateButtonState();

    mapManager.resultComponent = uiManager.resultsComponent;

    if (loader) {
      loader.classList.add("loaded");
      setTimeout(() => loader.remove(), 700);
    }

    const geoJson = dataManager.getCompanies();

    mapManager.addCompanyMarkers(geoJson, async (companyProps) => {
     const offers = await dataManager.getOffersByStorageId(
       companyProps.storage_id,
     );
     if (offers.length === 0) {
       alert("Aucune offre détaillée trouvée pour cette entreprise.");
       return;
     }

     uiManager.jobModal.openOfferList(
       companyProps,
       offers,
       async (selectedOffer) => {
         const stations = await dataManager.getStationsForCompany(
           companyProps.storage_id,
         );
         uiManager.jobModal.openOfferDetail(
           selectedOffer,
           companyProps,
           stations,
         );
       },
     );
   });
   
   // Connecter le modal au UIManager pour gérer la visibilité
   uiManager.jobModal.onVisibilityChange = (isVisible) => {
     uiManager.handleComponentVisibility(isVisible ? uiManager.jobModal : null);
   };

    uiManager.searchComponent.setOnMarkerClick(async (companyProps) => {
      const offers = await dataManager.getOffersByStorageId(
        companyProps.storage_id,
      );
      if (offers.length === 0) {
        alert("Pas d'offre détaillée.");
        return;
      }
      uiManager.jobModal.openOfferList(
        companyProps.company,
        offers,
        async (selectedOffer) => {
          const stations = await dataManager.getStationsForCompany(
            companyProps.storage_id,
          );
          uiManager.jobModal.openOfferDetail(
            selectedOffer,
            companyProps,
            stations,
          );
        },
      );
    });

    uiManager.favoritesComponent.onItemClick = async (id) => {
      const offer = favManager.getFavorites().find((fav) => fav.id === id);
      if (offer) {
        const stations = await dataManager.getStationsForCompany(
          offer.storage_id,
        );
        uiManager.jobModal.openOfferDetail(offer, offer.company, stations);
      }
    };

    uiManager.resultsComponent.onItemClick = async (offer, storageId) => {
      const stations = await dataManager.getStationsForCompany(storageId);
      const companyInfo = {
        company: offer.company || "Entreprise",
        storage_id: storageId,
      };
      uiManager.jobModal.openOfferDetail(offer, companyInfo, stations);
    };

    const toggleInterfaceMode = (isItineraryMode) => {
      const widgetsToToggle = [
        uiManager.searchComponent?.element,
        uiManager.favoritesComponent?.element,
        uiManager.resultsComponent?.element,
        document.getElementById("btn-close-route"),
      ];

      widgetsToToggle.forEach((el) => {
        if (el) {
          if (isItineraryMode) el.classList.add("widget-hidden");
          else el.classList.remove("widget-hidden");
        }
      });

      if (isItineraryMode && uiManager.jobModal) uiManager.jobModal.hide();

      if (uiManager.userLocationComponent) {
        if (isItineraryMode) {
          uiManager.userLocationComponent.hide();
        } else {
          uiManager.userLocationComponent.show();
          if (uiManager.navComponent)
            uiManager.navComponent.updateButtonState();
        }
      }
    };

    const exitItinerary = () => {
      mapManager.clearRoute();
      uiManager.routeComponent.hide();
      toggleInterfaceMode(false);
    };

    uiManager.routeComponent.setOnExit(exitItinerary);

    uiManager.jobModal.setOnItineraryClick(async (offer) => {
      if (!mapManager.userPosition || !mapManager.userPosition.lat) {
        alert("Position perdue. Veuillez rafraîchir la page.");
        return;
      }

      await pathFinder.init();

      let endCoords = null;
      if (offer.lat && offer.lon)
        endCoords = { lat: parseFloat(offer.lat), lng: parseFloat(offer.lon) };
      else if (offer && offer.coordinates)
        endCoords = { lat: offer.coordinates[1], lng: offer.coordinates[0] };

      if (!endCoords) {
        alert("Erreur coordonnées offre");
        return;
      }

      try {
        const start = mapManager.userPosition;
        const routeResult = pathFinder.findPath(start, endCoords);

        if (!routeResult) {
          alert("Aucun itinéraire trouvé.");
          return;
        }
        toggleInterfaceMode(true);
        mapManager.drawRoute(routeResult, () => {
          uiManager.routeComponent.show(routeResult);
        });
        uiManager.routeComponent.show(routeResult);
      } catch (error) {
        alert("Erreur calcul.");
      }
    });
  } catch (error) {
    if (statusText) {
      statusText.textContent = "Démarrage impossible";
      statusText.style.color = "#e74c3c";
    }
    if (detailText) {
      detailText.textContent = error;
      detailText.style.color = "#e74c3c";
      detailText.style.fontWeight = "bold";
    }
    const progressBar = document.getElementById("loader-progress");
    if (progressBar) progressBar.style.background = "#e74c3c";
  }
})();

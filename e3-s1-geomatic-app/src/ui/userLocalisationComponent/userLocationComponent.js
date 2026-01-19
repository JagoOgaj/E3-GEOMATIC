/**
 * Gère l'interface et la logique d'acquisition de la position de l'utilisateur.
 * Permet à l'utilisateur de se géolocaliser via l'API navigateur (GPS) ou de sélectionner
 * manuellement sa position sur la carte à l'aide d'une loupe interactive.
 *
 * Le constructeur initialise les références vers le gestionnaire de carte et les callbacks,
 * et prépare les états internes pour la sélection manuelle.
 *
 * @param {Object} mapManager - L'instance du gestionnaire de carte (Leaflet).
 * @param {Function} onLocationSelected - Callback exécuté une fois la position validée.
 */
export class UserLocationComponent {
  constructor(mapManager, onLocationSelected) {
    this.mapManager = mapManager;
    this.onLocationSelected = onLocationSelected;
    this.element = null;
    this.loupeElement = null;
    this.isSelecting = false;

    this.onStartSelection = () => {};
    this.onEndSelection = () => {};
  }

  /**
   * Initialise le composant en générant le rendu HTML et en configurant la loupe.
   */
  init() {
    this.render();
    this.setupLoupe();
  }

  /**
   * Génère les éléments du DOM nécessaires au fonctionnement du composant
   * (bouton principal, bouton GPS) et attache les événements initiaux.
   */
  render() {
    this.container = document.createElement("div");
    this.container.className = "location-controls-container";

    this.gpsBtn = document.createElement("button");
    this.gpsBtn.className = "gps-btn";
    this.gpsBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    this.gpsBtn.title = "Me géolocaliser automatiquement";
    this.gpsBtn.style.display = "none";
    this.gpsBtn.onclick = () => this.handleGPSClick();

    this.element = document.createElement("button");
    this.element.className = "location-request-btn";
    this.element.innerHTML =
      '<i class="fas fa-map-marker-alt"></i> Modifier/Définir ma position';
    this.element.onclick = () => {
      if (this.isSelecting) {
        this.cleanupMap();
      } else {
        this.startManualSelection();
      }
    };

    this.container.appendChild(this.gpsBtn);
    this.container.appendChild(this.element);
    document.body.appendChild(this.container);
  }

  /**
   * Crée et injecte l'élément DOM représentant la loupe pour la sélection précise sur la carte.
   */
  setupLoupe() {
    this.loupeElement = document.createElement("div");
    this.loupeElement.id = "map-loupe";
    this.loupeElement.innerHTML = '<div class="loupe-crosshair"></div>';
    document.body.appendChild(this.loupeElement);
  }

  /**
   * Gère le clic sur le bouton GPS.
   * Tente de récupérer la position actuelle via l'API Geolocation du navigateur.
   * Si la position est valide et en France, elle est transmise au gestionnaire.
   */
  async handleGPSClick() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    this.gpsBtn.classList.add("loading");

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      const latlng = { lat: latitude, lng: longitude };

      if (this.mapManager.isLocationInFrance(latlng)) {
        this.finish(latlng);
      } else {
        alert("Votre position GPS semble être hors de France métropolitaine.");
      }
    } catch (error) {
      alert("Impossible de récupérer votre position GPS.");
    } finally {
      this.gpsBtn.classList.remove("loading");
    }
  }

  /**
   * Active le mode de sélection manuelle sur la carte.
   * Masque les éléments d'interface non nécessaires, affiche la loupe
   * et active les écouteurs d'événements sur la carte.
   */
  startManualSelection() {
    this.isSelecting = true;
    this.onStartSelection();

    this.mapManager.hideFeatures();

    this.gpsBtn.style.display = "flex";
    this.element.classList.add("cancel-mode");
    this.element.innerHTML = '<i class="fas fa-times"></i> Annuler';

    const mapDiv = document.getElementById("map");
    mapDiv.classList.add("cursor-crosshair");

    this.loupeElement.style.display = "block";
    setTimeout(() => this.loupeElement.classList.add("visible"), 10);

    this.mapManager.initLoupe(this.loupeElement);

    this.mapManager.map.on("mousemove", this.handleMouseMove);
    this.mapManager.map.on("click", this.handleMapClick);
  }

  /**
   * Gère le mouvement de la souris sur la carte lors de la sélection manuelle.
   * Met à jour la position de la loupe et la vue zoomée à l'intérieur de celle-ci.
   *
   * @param {Object} e - L'événement Leaflet contenant les coordonnées.
   */
  handleMouseMove = (e) => {
    const { clientX, clientY } = e.originalEvent;
    const offsetX = 75;
    const offsetY = 75;

    this.loupeElement.style.left = `${clientX - offsetX}px`;
    this.loupeElement.style.top = `${clientY - offsetY}px`;

    this.mapManager.updateLoupeView(e.latlng);
  };

  /**
   * Gère le clic sur la carte lors de la sélection manuelle.
   * Vérifie si la position cliquée est en France et finalise la sélection.
   *
   * @param {Object} e - L'événement Leaflet contenant les coordonnées du clic.
   */
  handleMapClick = (e) => {
    if (this.mapManager.isLocationInFrance(e.latlng)) {
      this.finish(e.latlng);
    } else {
      alert("Veuillez sélectionner une position en France métropolitaine.");
    }
  };

  /**
   * Nettoie l'interface et désactive le mode de sélection manuelle.
   * Retire les écouteurs d'événements, masque la loupe et réinitialise les boutons.
   */
  cleanupMap() {
    this.loupeElement.classList.remove("visible");

    setTimeout(() => {
      if (!this.isSelecting) {
        this.loupeElement.style.display = "none";
        this.mapManager.removeLoupe();
      }
    }, 300);

    this.gpsBtn.style.display = "none";
    this.element.classList.remove("cancel-mode");
    this.element.innerHTML =
      '<i class="fas fa-map-marker-alt"></i> Modifier/Définir ma position';

    document.getElementById("map").classList.remove("cursor-crosshair");
    this.mapManager.map.off("mousemove", this.handleMouseMove);
    this.mapManager.map.off("click", this.handleMapClick);
  }

  /**
   * Finalise le processus de sélection de position.
   * Appelle les callbacks de fin de sélection et de mise à jour de la position.
   *
   * @param {Object} position - Les coordonnées {lat, lng} sélectionnées.
   */
  finish(position) {
    this.isSelecting = false;
    this.cleanupMap();
    this.mapManager.showFeatures();
    this.onEndSelection();

    if (this.onLocationSelected) {
      this.onLocationSelected(position);
    }
  }

  /**
   * Affiche le conteneur du composant.
   */
  show() {
    this.container.style.display = "flex";
  }

  /**
   * Masque le conteneur du composant.
   */
  hide() {
    this.container.style.display = "none";
  }

  /**
   * Définit le callback à exécuter au début de la sélection manuelle.
   * @param {Function} callback - La fonction à appeler.
   */
  setOnStartSelection(callback) {
    this.onStartSelection = callback;
  }

  /**
   * Définit le callback à exécuter à la fin de la sélection manuelle.
   * @param {Function} callback - La fonction à appeler.
   */
  setOnEndSelection(callback) {
    this.onEndSelection = callback;
  }
}

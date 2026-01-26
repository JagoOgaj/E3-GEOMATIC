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

    this.boundHideLoupeOnHover = null;
    this.boundShowLoupeOnHover = null;
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

    this.element.addEventListener("click", () => {
      if (this.isSelecting) this.cancelSelection();
      else this.startSelectionProcess();
    });
    this.container.appendChild(this.gpsBtn);
    this.container.appendChild(this.element);
    document.body.appendChild(this.container);
  }

  /**
   * Gère le clic sur le bouton GPS.
   * Tente de récupérer la position actuelle via l'API Geolocation du navigateur.
   * Si la position est valide et en France, elle est transmise au gestionnaire.
   */
  handleGPSClick() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée.");
      return;
    }
    this.gpsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (this.mapManager.isLocationInFrance(latlng)) {
          this.finish(latlng);
        } else {
          alert("Hors de France.");
        }
        this.gpsBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
      },
      (err) => {
        console.error(err);
        alert("Erreur GPS.");
        this.gpsBtn.innerHTML = '<i class="fas fa-crosshairs"></i>';
      },
      { enableHighAccuracy: true },
    );
  }

  /**
   * Actualise dynamiquement l'aspect visuel et le texte du bouton principal.
   * Cette méthode ajuste le libellé ("Définir" ou "Modifier" la position)
   * selon que des coordonnées utilisateur sont déjà enregistrées dans le MapManager.
   * Elle s'assure également de réinitialiser le style visuel (suppression de la
   * classe 'cancel-mode') pour refléter l'état de repos du composant.
   * * @returns {void}
   */
  updateButtonState() {
    if (this.isSelecting) return;
    if (this.mapManager.userPosition && this.mapManager.userPosition.lat) {
      this.element.innerHTML =
        '<i class="fas fa-map-marker-alt"></i> Modifier la position';
      this.element.classList.remove("cancel-mode");
    } else {
      this.element.innerHTML =
        '<i class="fas fa-map-marker-alt"></i> Définir ma position';
      this.element.classList.remove("cancel-mode");
    }
  }

  /**
   * Crée et injecte l'élément DOM représentant la loupe pour la sélection précise sur la carte.
   */
  setupLoupe() {
    this.loupeElement = document.createElement("div");
    this.loupeElement.id = "loupe-map";
    this.loupeElement.className = "magnifying-glass";
    document.body.appendChild(this.loupeElement);
  }

  /**
   * Masque le conteneur du composant.
   */
  hide() {
    if (this.container) this.container.style.display = "none";
  }

  /**
   * Affiche le conteneur du composant.
   */
  show() {
    if (this.container) this.container.style.display = "flex";
  }

  /**
   * Active le mode de sélection manuelle sur la carte.
   * Masque les éléments d'interface non nécessaires, affiche la loupe
   * et active les écouteurs d'événements sur la carte.
   */
  startSelectionProcess() {
    this.isSelecting = true;
    this.element.innerHTML = '<i class="fas fa-times"></i> Annuler';
    this.element.classList.add("cancel-mode");
    this.gpsBtn.style.display = "flex";

    this.onStartSelection();

    this.mapManager.hideFeatures();
    this.loupeElement.style.display = "block";
    requestAnimationFrame(() => {
      this.loupeElement.classList.add("visible");
    });

    this.boundHideLoupeOnHover = this.hideLoupeOnHover.bind(this);
    this.boundShowLoupeOnHover = this.showLoupeOnHover.bind(this);

    this.element.addEventListener('mouseenter', this.boundHideLoupeOnHover);
    this.element.addEventListener('mouseleave', this.boundShowLoupeOnHover);
    this.gpsBtn.addEventListener('mouseenter', this.boundHideLoupeOnHover);
    this.gpsBtn.addEventListener('mouseleave', this.boundShowLoupeOnHover);

    this.mapManager.initLoupe("loupe-map");
    document.getElementById("map").style.cursor = "none";

    this.mapManager.map.on("mousemove", this.handleMouseMove);
    this.mapManager.map.on("click", this.handleMapClick);
  }

  /**
   * Annule le processus et revient à l'état initial
   */
  cancelSelection() {
    this.isSelecting = false;
    this.cleanupMap();
    this.mapManager.showFeatures();
    this.onEndSelection();
    this.updateButtonState();
    
    // Ensure loupe is visible again after canceling
    if (this.loupeElement) {
      this.loupeElement.classList.add("visible");
    }
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
  }

  /**
   * Hide the loupe when hovering over buttons
   */
  hideLoupeOnHover() {
    if (this.isSelecting && this.loupeElement) {
      this.loupeElement.classList.remove("visible");
    }
  }

  /**
   * Show the loupe when leaving buttons
   */
  showLoupeOnHover() {
    if (this.isSelecting && this.loupeElement) {
      this.loupeElement.classList.add("visible");
    }
  }

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

    document.getElementById("map").style.cursor = "";

    // Remove hover event listeners
    this.element.removeEventListener('mouseenter', this.boundHideLoupeOnHover);
    this.element.removeEventListener('mouseleave', this.boundShowLoupeOnHover);
    this.gpsBtn.removeEventListener('mouseenter', this.boundHideLoupeOnHover);
    this.gpsBtn.removeEventListener('mouseleave', this.boundShowLoupeOnHover);

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

    setTimeout(() => this.updateButtonState(), 50);
  }
}

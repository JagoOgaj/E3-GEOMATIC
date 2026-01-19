import { FRANCE_POLYGONS } from "../utils/const.js";

/**
 * Gestionnaire principal de la carte interactive Leaflet.
 * Gère l'affichage des marqueurs, des clusters, des stations de transport,
 * de la géolocalisation utilisateur et du tracé des itinéraires.
 */
export class MapManager {
  constructor(divId) {
    this.map = L.map(divId, { zoomControl: false }).setView(
      [48.8566, 2.3522],
      13,
    );
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
      },
    ).addTo(this.map);

    this.userMarker = null;
    this.userPosition = {};
    this.radiusCircle = null;
    this.resultComponent = null;
    this.loupeMap = null;

    this.markersLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      chunkedLoading: true,
      chunkInterval: 200,
      chunkDelay: 50,
      animate: true,
      maxClusterRadius: 80,
      iconCreateFunction: (cluster) => {
        const companyCount = cluster.getChildCount();
        let c = "halo-level-1";
        let size = 60;

        if (companyCount >= 10 && companyCount < 50) {
          c = "halo-level-2";
          size = 70;
        } else if (companyCount >= 50) {
          c = "halo-level-3";
          size = 90;
        }

        return L.divIcon({
          html: `
                <div class="halo-ring ${c}"></div>
                <div class="halo-content">
                    <i class="fas fa-building"></i>
                    <span class="halo-count">${companyCount}</span>
                </div>
            `,
          className: "halo-cluster-custom",
          iconSize: [size, size],
        });
      },
    });

    this.map.addLayer(this.markersLayer);
    this.stationsLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.featureGroup().addTo(this.map);
    this.isRouteMode = false;

    this.#initUserLocation();
  }

  /**
   * Initialise la géolocalisation du navigateur.
   * Si l'utilisateur accepte, centre la carte sur sa position.
   * Méthode privée.
   * @returns {void}
   * @private
   */
  #initUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          this.#drawUserMarker();
          this.map.flyTo([this.userPosition.lat, this.userPosition.lng], 13);
        },
        () => {},
      );
    } else {
      this.#drawUserMarker();
    }
  }

  /**
   * Dessine ou met à jour le marqueur représentant la position de l'utilisateur.
   * Utilise une icône pulsée personnalisée.
   * Méthode privée.
   * @returns {void}
   * @private
   */
  #drawUserMarker() {
    const pulseIcon = L.divIcon({
      className: "user-location-marker",
      html: '<div class="pulse-ring"></div><div class="core-dot"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    this.userMarker = L.marker([this.userPosition.lat, this.userPosition.lng], {
      icon: pulseIcon,
    }).addTo(this.map);
  }

  /**
   * Re-centre la vue de la carte sur la position actuelle de l'utilisateur
   * avec une animation fluide.
   * @returns {void}
   */
  recenterOnUser() {
    if (this.userPosition) {
      this.map.flyTo([this.userPosition.lat, this.userPosition.lng], 14, {
        animate: true,
        duration: 1.5,
      });
    }
  }

  /**
   * Ajoute les marqueurs des entreprises sur la carte à partir d'un objet GeoJSON.
   * Gère le clustering et les événements de clic.
   * @param {Object} geoJson - L'objet GeoJSON contenant les features des entreprises.
   * @param {Function} onCompanyClick - Callback exécuté au clic sur une entreprise.
   * @returns {void}
   */
  addCompanyMarkers(geoJson, onCompanyClick) {
    this.resultComponent.updateResults(geoJson);
    this.markersLayer.clearLayers();

    if (!geoJson || !geoJson.features) return;
    const markers = geoJson.features
      .map((feature) => {
        const props = {
          ...feature.properties,
          ...feature.geometry,
        };

        const count = props.offers_count || 0;

        if (count === 0) return null;

        const lat = feature.geometry.coordinates[1];
        const lng = feature.geometry.coordinates[0];

        const badgeHtml =
          count > 1 ? `<span class="marker-badge">${count}</span>` : "";

        const customIcon = L.divIcon({
          className: "",
          html: `
                    <div class="custom-marker-container">
                        <div class="company-marker-icon">
                            <i class="fas fa-building"></i>
                        </div>
                        ${badgeHtml}
                    </div>
                `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker([lat, lng], {
          icon: customIcon,
          offerCount: count,
        });

        marker.on("click", () => {
          this.map.flyTo([lat, lng], 15);
          if (onCompanyClick) {
            onCompanyClick(props);
          }
        });

        return marker;
      })
      .filter((m) => m !== null);
    this.markersLayer.addLayers(markers);
  }

  /**
   * Affiche les stations de transport sur la carte avec des icônes spécifiques selon le mode (Bus, Tram, Métro).
   * Ajoute une popup descriptive pour chaque station.
   * @param {Array<Object>} stations - Liste des objets stations à afficher.
   * @returns {void}
   */
  displayStations(stations) {
    this.stationsLayer.clearLayers();

    if (!stations || stations.length === 0) return;

    const markers = stations.map((st) => {
      const modes = st.modes || [];
      const lat = st.lat || (st.geometry ? st.geometry.coordinates[1] : 0);
      const lon = st.lon || (st.geometry ? st.geometry.coordinates[0] : 0);

      let iconClass = "fa-bus";
      let bgColor = "#3498db";
      let typeLabel = "Arrêt de Bus";

      if (modes.some((m) => m.toUpperCase().includes("TRAIN"))) {
        iconClass = "fa-train";
        bgColor = "#e67e22";
        typeLabel = "Gare SNCF";
      } else if (modes.some((m) => m.toUpperCase().includes("METRO"))) {
        iconClass = "fa-subway";
        bgColor = "#27ae60";
        typeLabel = "Station de Métro";
      } else if (modes.some((m) => m.toUpperCase().includes("TRAM"))) {
        iconClass = "fa-tram";
        bgColor = "#9b59b6";
        typeLabel = "Arrêt de Tram";
      }

      const customIcon = L.divIcon({
        className: "station-marker-icon",
        html: `
            <div class="station-pin" style="background-color: ${bgColor};">
                <i class="fas ${iconClass}"></i>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      const popupContent = `
        <div style="text-align:center; min-width:150px;">
            <strong style="color:#2c3e50; font-size:1.1em;">${st.name || "Station"}</strong>
            <div style="margin:5px 0; color:${bgColor}; font-weight:600;">
                <i class="fas ${iconClass}"></i> ${typeLabel}
            </div>
            <div style="font-size:0.9em; color:#7f8c8d;">
                ${st.distance ? `à <b>${Math.round(st.distance)}m</b>` : ""}
            </div>
            ${modes.length > 0 ? `<div style="margin-top:5px; font-size:0.8em; color:#95a5a6;">Lignes : ${modes.join(", ")}</div>` : ""}
        </div>
      `;

      marker.bindPopup(popupContent);
      return marker;
    });

    markers.forEach((m) => this.stationsLayer.addLayer(m));
    if (!this.map.hasLayer(this.stationsLayer)) {
      this.stationsLayer.addTo(this.map);
    }
  }

  /**
   * Supprime tous les marqueurs de stations de transport de la carte.
   * @returns {void}
   */
  clearStations() {
    this.stationsLayer.clearLayers();
  }

  /**
   * Met à jour l'affichage des entreprises (Wrapper pour addCompanyMarkers).
   * @param {Object} geoJsonData - Les données GeoJSON.
   * @param {Function} onCompanyClick - Le callback de clic.
   * @returns {void}
   */
  updateMarkers(geoJsonData, onCompanyClick) {
    this.addCompanyMarkers(geoJsonData, onCompanyClick);
  }

  /**
   * Affiche un cercle de prévisualisation du rayon de recherche autour de l'utilisateur.
   * @param {number} radiusKm - Le rayon en kilomètres.
   * @returns {void}
   */
  previewRadius(radiusKm) {
    this.clearRadiusPreview();

    const center = this.userPosition || this.map.getCenter();

    this.radiusCircle = L.circle(center, {
      radius: radiusKm * 1000,
      color: "#3498db",
      weight: 1,
      dashArray: "5, 5",
      fillColor: "#3498db",
      fillOpacity: 0.1,
    }).addTo(this.map);

    this.map.fitBounds(this.radiusCircle.getBounds());
  }

  /**
   * Supprime le cercle de prévisualisation du rayon.
   * @returns {void}
   */
  clearRadiusPreview() {
    if (this.radiusCircle) {
      this.map.removeLayer(this.radiusCircle);
      this.radiusCircle = null;
    }
  }

  /**
   * Retourne la couleur associée à un type de transport donné.
   * @param {string} type - Le type de transport (ex: 'METRO', 'BUS').
   * @returns {string} Le code couleur hexadécimal.
   */
  getTransportColor(type) {
    if (!type) return "#7f8c8d";
    const t = type.toUpperCase();
    if (t.includes("METRO")) return "#27ae60";
    if (t.includes("BUS")) return "#2980b9";
    if (t.includes("TRAM")) return "#8e44ad";
    if (t.includes("TRAIN") || t.includes("RER")) return "#e67e22";
    if (t.includes("WALK") || t.includes("MARCHE")) return "#95a5a6";
    return "#3498db";
  }
  /**
   * Dessine un itinéraire détaillé avec des segments colorés par mode de transport.
   * Ajoute des popups riches sur les points d'étape et gère la marche d'approche.
   * @param {Object} pathData - Les données du chemin calculé.
   * @param {Function} onRouteClick - Callback au clic sur le tracé.
   */
  drawRoute(pathData, onRouteClick) {
    this.clearRoute();
    this.isRouteMode = true;

    if (this.map.hasLayer(this.markersLayer))
      this.map.removeLayer(this.markersLayer);
    if (this.map.hasLayer(this.stationsLayer))
      this.map.removeLayer(this.stationsLayer);
    if (!this.map.hasLayer(this.routeLayer)) this.map.addLayer(this.routeLayer);

    const path = pathData.path;
    if (!path || path.length === 0) return;

    const bounds = L.latLngBounds();

    if (this.userPosition && this.userPosition.lat) {
      const startStep = path[0];
      if (
        Math.abs(this.userPosition.lat - startStep.lat) > 0.0001 ||
        Math.abs(this.userPosition.lng - startStep.lon) > 0.0001
      ) {
        const userLatLng = [this.userPosition.lat, this.userPosition.lng];
        const startLatLng = [startStep.lat, startStep.lon];

        bounds.extend(userLatLng);

        const walkPolyline = L.polyline([userLatLng, startLatLng], {
          color: "#95a5a6",
          weight: 5,
          opacity: 0.8,
          dashArray: "10, 10",
          lineJoin: "round",
        }).addTo(this.routeLayer);

        walkPolyline.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (onRouteClick) onRouteClick();
        });
      }
    }

    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];

      const p1 = [start.lat, start.lon];
      const p2 = [end.lat, end.lon];

      bounds.extend(p1);
      bounds.extend(p2);
      const color = this.getTransportColor(end.type);

      const segment = L.polyline([p1, p2], {
        color: color,
        weight: 6,
        opacity: 0.9,
        lineJoin: "round",
      }).addTo(this.routeLayer);
      segment.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (onRouteClick) onRouteClick();
      });
    }

    path.forEach((step) => {
      const latlng = [step.lat, step.lon];

      // Point de DÉPART
      if (step.type === "DEPART") {
        L.marker(latlng, {
          icon: L.divIcon({
            className: "route-pin start",
            html: '<div style="background:#2ecc71; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [14, 14],
          }),
        })
          .addTo(this.routeLayer)
          .bindTooltip("Départ", { direction: "top", offset: [0, -10] });
      } else {
        const color = this.getTransportColor(step.type);

        let iconClass = "fa-walking";
        if (step.type.includes("METRO")) iconClass = "fa-subway";
        if (step.type.includes("BUS")) iconClass = "fa-bus";
        if (step.type.includes("TRAM")) iconClass = "fa-tram";
        if (step.type.includes("TRAIN") || step.type.includes("RER"))
          iconClass = "fa-train";

        const marker = L.circleMarker(latlng, {
          radius: 7,
          fillColor: "#ffffff",
          color: color,
          weight: 4,
          opacity: 1,
          fillOpacity: 1,
        }).addTo(this.routeLayer);
        const lineInfo = step.line
          ? `<span style="background:#eee; padding:2px 6px; border-radius:4px; margin-left:5px; font-weight:bold;">${step.line}</span>`
          : "";

        const popupContent = `
                <div style="text-align:center; font-family:'Segoe UI', sans-serif; min-width:140px; padding:5px;">
                    <div style="background:${color}; color:white; padding:4px 10px; border-radius:15px; display:inline-block; margin-bottom:8px; font-size:0.85em; font-weight:bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        <i class="fas ${iconClass}"></i> ${step.type}
                    </div>
                    <div style="font-weight:700; color:#2c3e50; font-size:1.05em; margin-bottom:4px;">
                        ${step.name} ${lineInfo}
                    </div>
                    ${step.duration ? `<div style="color:#7f8c8d; font-size:0.85em;"><i class="far fa-clock"></i> env. ${Math.round(step.duration / 60)} min</div>` : ""}
                    ${step.instruction ? `<div style="font-size:0.8em; color:#95a5a6; margin-top:5px; font-style:italic;">"${step.instruction}"</div>` : ""}
                </div>
             `;

        marker.bindPopup(popupContent);
        marker.bindTooltip(step.name, {
          direction: "top",
          offset: [0, -10],
          className: "station-tooltip",
          opacity: 0.9,
        });
      }
    });

    const lastStep = path[path.length - 1];
    const endIcon = L.divIcon({
      className: "route-pin end",
      html: '<i class="fas fa-flag-checkered" style="color:#e74c3c; font-size:28px; text-shadow: 2px 2px 0 #fff; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));"></i>',
      iconSize: [30, 30],
      iconAnchor: [4, 28],
    });
    L.marker([lastStep.lat, lastStep.lon], {
      icon: endIcon,
      zIndexOffset: 1000,
    }).addTo(this.routeLayer);
    this.map.fitBounds(bounds, { padding: [50, 50] });
  }

  /**
   * Quitte le mode itinéraire, efface le tracé et réaffiche les marqueurs d'entreprises.
   * @returns {void}
   */
  clearRoute() {
    this.routeLayer.clearLayers();
    this.isRouteMode = false;

    if (!this.map.hasLayer(this.markersLayer)) {
      this.map.addLayer(this.markersLayer);
      this.map.addLayer(this.stationsLayer);
    }
  }

  /**
   * Vérifie si une coordonnée est (grossièrement) en France métropolitaine.
   * @param {Object} latlng - {lat, lng}
   * @returns {boolean}
   */
  isLocationInFrance(latlng) {
    const x = latlng.lat;
    const y = latlng.lng;
    const insidePolygon = (polygon) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0],
          yi = polygon[i][1];
        const xj = polygon[j][0],
          yj = polygon[j][1];

        const intersect =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    return FRANCE_POLYGONS.some((poly) => insidePolygon(poly));
  }

  /**
   * Initialise une mini-carte Leaflet dans la div de la loupe.
   * @param {string} divId - ID du conteneur de la loupe
   */
  initLoupe(divId) {
    if (this.loupeMap) this.loupeMap.remove();
    this.loupeMap = L.map(divId, {
      zoomControl: false,
      attributionControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      dragging: false,
      keyboard: false,
      scrollWheelZoom: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19 },
    ).addTo(this.loupeMap);
  }

  /**
   * Met à jour la vue de la loupe pour suivre la souris avec un zoom élevé.
   * @param {Object} latlng - Coordonnées de la souris
   */
  updateLoupe(latlng) {
    if (this.loupeMap) {
      // Zoom fixe élevé (ex: 16) pour effet "loupe"
      this.loupeMap.setView(latlng, 16, { animate: false });
    }
  }

  /**
   * Détruit la carte de la loupe pour libérer la mémoire.
   */
  removeLoupe() {
    if (this.loupeMap) {
      this.loupeMap.remove();
      this.loupeMap = null;
    }
  }

  /**
   * Met à jour manuellement les coordonnées de l'utilisateur.
   * Cette méthode enregistre la nouvelle position, déclenche le rendu du marqueur
   * pulsé (`#drawUserMarker`) et déplace la vue de la carte vers ce point avec
   * un niveau de zoom intermédiaire.
   * * @param {number} lat - Latitude de la nouvelle position.
   * @param {number} lng - Longitude de la nouvelle position.
   */
  setUserPosition(lat, lng) {
    this.userPosition = { lat, lng };
    this.#drawUserMarker();
    this.map.flyTo([lat, lng], 13);
  }

  /**
   * Masque temporairement tous les éléments interactifs de la carte.
   * Retire les couches de marqueurs d'entreprises, de stations, d'itinéraires,
   * ainsi que le marqueur utilisateur et le cercle de rayon.
   * Utile pour nettoyer la vue lors de modes spécifiques comme la sélection manuelle.
   */
  hideFeatures() {
    if (this.map.hasLayer(this.markersLayer))
      this.map.removeLayer(this.markersLayer);
    if (this.map.hasLayer(this.stationsLayer))
      this.map.removeLayer(this.stationsLayer);
    if (this.map.hasLayer(this.routeLayer))
      this.map.removeLayer(this.routeLayer);
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    if (this.radiusCircle) this.map.removeLayer(this.radiusCircle);
  }

  /**
   * Restaure l'affichage des éléments de la carte selon le contexte actuel.
   * Si le mode itinéraire est actif, affiche la couche de trajet ; sinon, affiche
   * les marqueurs d'entreprises. Réaffiche systématiquement le marqueur de
   * position utilisateur s'il existe.
   */
  showFeatures() {
    if (this.isRouteMode) {
      if (!this.map.hasLayer(this.routeLayer))
        this.map.addLayer(this.routeLayer);
    } else {
      if (!this.map.hasLayer(this.markersLayer))
        this.map.addLayer(this.markersLayer);
    }
    if (this.userMarker) this.userMarker.addTo(this.map);
  }
}

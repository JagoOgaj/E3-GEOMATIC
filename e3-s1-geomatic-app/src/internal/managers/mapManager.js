/**
 * Gestionnaire principal de la carte interactive Leaflet.
 * Gère l'affichage des marqueurs, des clusters, des stations de transport,
 * de la géolocalisation utilisateur et du tracé des itinéraires.
 */
export class MapManager {
  constructor(divId) {
    this.map = L.map(divId, { zoomControl: false }).setView(
      [48.8566, 2.3522],
      13
    );
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
      }
    ).addTo(this.map);

    this.userMarker = null;
    this.userPosition = {};
    this.radiusCircle = null;
    this.resultComponent = null;

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
        () => {}
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
    this.clearStations();

    if (!stations || stations.length === 0) return;

    const markers = stations.map((st) => {
      const modes = st.modes || [];

      let iconClass = "fa-bus";
      let bgColor = "#3498db";
      let typeLabel = "Arrêt de Bus";

      if (modes.includes("TRAIN") || modes.includes("Train")) {
        iconClass = "fa-train";
        bgColor = "#e67e22";
        typeLabel = "Gare SNCF";
      } else if (modes.includes("METRO") || modes.includes("Metro")) {
        iconClass = "fa-subway";
        bgColor = "#27ae60";
        typeLabel = "Station de Métro";
      } else if (modes.includes("TRAM") || modes.includes("Tram")) {
        iconClass = "fa-tram";
        bgColor = "#9b59b6";
        typeLabel = "Arrêt de Tram";
      }

      if (modes.length > 1) {
        typeLabel += " / Correspondance";
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

      const marker = L.marker([st.lat, st.lon], { icon: customIcon });

      const popupContent = `
                <div style="text-align:center; min-width:150px;">
                    <strong style="color:#2c3e50; font-size:1.1em;">${
                      st.name || "Station"
                    }</strong>
                    <div style="margin:5px 0; color:${bgColor}; font-weight:600;">
                        <i class="fas ${iconClass}"></i> ${typeLabel}
                    </div>
                    <div style="font-size:0.9em; color:#7f8c8d;">
                        à <b>${Math.round(st.distance)}m</b> de l'offre
                    </div>
                    ${
                      modes.length > 0
                        ? `<div style="margin-top:5px; font-size:0.8em; color:#95a5a6;">Lignes : ${modes.join(
                            ", "
                          )}</div>`
                        : ""
                    }
                </div>
            `;

      marker.bindPopup(popupContent);

      return marker;
    });

    markers.forEach((m) => this.stationsLayer.addLayer(m));

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      this.map.fitBounds(group.getBounds().pad(0.2));
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
   * Dessine un itinéraire complet sur la carte.
   * Inclut le tracé polyline, les pastilles des arrêts et les marqueurs départ/arrivée.
   * Bascule la carte en mode itinéraire.
   * @param {Object} pathData - Les données du chemin calculé.
   * @param {Function} onRouteClick - Callback au clic sur le tracé.
   * @returns {void}
   */
  drawRoute(pathData, onRouteClick) {
    this.clearRoute();
    this.isRouteMode = true;

    if (this.map.hasLayer(this.markersLayer))
      this.map.removeLayer(this.markersLayer);
    if (this.map.hasLayer(this.stationsLayer))
      this.map.removeLayer(this.stationsLayer);

    const latlngs = [];

    if (this.userPosition && this.userPosition.lat) {
      latlngs.push([this.userPosition.lat, this.userPosition.lng]);
    }

    pathData.path.forEach((step) => {
      const point = [step.lat, step.lon];
      latlngs.push(point);

      if (step.type !== "DEPART") {
        const color = this.getTransportColor(step.type);

        L.circleMarker(point, {
          radius: 6,
          fillColor: "#ffffff",
          color: color,
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
        })
          .bindTooltip(step.name, {
            direction: "top",
            offset: [0, -10],
            className: "station-tooltip",
          })
          .addTo(this.routeLayer);
      }
    });

    const polyline = L.polyline(latlngs, {
      color: "#34495e",
      weight: 5,
      opacity: 0.8,
      lineJoin: "round",
      dashArray: "10, 10",
    }).addTo(this.routeLayer);

    polyline.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (onRouteClick) onRouteClick();
    });

    const startIcon = L.divIcon();
    const endIcon = L.divIcon({
      className: "route-pin end",
      html: '<i class="fas fa-flag-checkered"></i>',
      iconSize: [30, 30],
    });

    if (latlngs.length > 0) {
      L.marker(latlngs[0], { icon: startIcon }).addTo(this.routeLayer);
      L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(
        this.routeLayer
      );
    }

    this.map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
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
}

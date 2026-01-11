/**
 * Composant d'interface affichant un pavé directionnel (D-Pad) sur la carte.
 * Permet à l'utilisateur de déplacer la vue de la carte (pan) et de se recentrer
 * sur sa position géolocalisée sans utiliser le tactile ou la souris directement.
 * * Dépendances :
 * @param {string} parentId - L'ID de l'élément DOM parent (ex: 'ui-layer').
 * @param {Object} mapManager - Instance du gestionnaire de carte pour contrôler le déplacement.
 */
export class NavigationComponent {
  constructor(parentId, mapManager) {
    this.parent = document.getElementById(parentId);
    this.mapManager = mapManager;
    this.element = null;
  }

  /**
   * Construit le DOM du widget de navigation (boutons fléchés et bouton central),
   * l'injecte dans le conteneur parent et attache les événements de clic.
   * @returns {void}
   */
  init() {
    this.element = document.createElement("div");
    this.element.className = "nav-widget";

    this.element.innerHTML = `
            <div></div>
            <button class="nav-btn btn-up"><i class="fas fa-chevron-up"></i></button>
            <div></div>

            <button class="nav-btn btn-left"><i class="fas fa-chevron-left"></i></button>
            <button class="nav-btn btn-center" title="Recentrer sur moi"><i class="fas fa-crosshairs"></i></button>
            <button class="nav-btn btn-right"><i class="fas fa-chevron-right"></i></button>

            <div></div>
            <button class="nav-btn btn-down"><i class="fas fa-chevron-down"></i></button>
            <div></div>
        `;

    this.parent.appendChild(this.element);
    this.#setupEvents();
  }

  /**
   * Méthode privée. Configure les écouteurs d'événements sur les boutons du widget.
   * Définit le déplacement (pan) de la carte pour les flèches et le recentrage pour le bouton central.
   * @returns {void}
   * @private
   */
  #setupEvents() {
    const PAN_OFFSET = 150;

    const addMoveEvent = (selector, x, y) => {
      const btn = this.element.querySelector(selector);
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.mapManager.map.panBy([x, y]);
        });
      }
    };

    addMoveEvent(".btn-up", 0, -PAN_OFFSET);
    addMoveEvent(".btn-down", 0, PAN_OFFSET);
    addMoveEvent(".btn-left", -PAN_OFFSET, 0);
    addMoveEvent(".btn-right", PAN_OFFSET, 0);

    const centerBtn = this.element.querySelector(".btn-center");
    if (centerBtn) {
      centerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.mapManager.recenterOnUser();
      });
    }
  }
}

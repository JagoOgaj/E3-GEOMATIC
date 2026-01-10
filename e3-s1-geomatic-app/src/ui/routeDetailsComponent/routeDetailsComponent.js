/**
 * Composant d'interface utilisateur affichant les étapes détaillées d'un itinéraire.
 * Se présente sous forme d'une fenêtre modale flottante listant les changements de transport
 * et la durée totale du trajet.
 * * Dépendances : Aucune.
 */
export class RouteDetailsComponent {
  constructor() {
    this.parent = document.body;
    this.element = null;
    this.onExitCallback = null;
  }

  /**
   * Construit la structure HTML du widget, l'injecte dans le corps du document (body)
   * et configure les événements de clic pour la fermeture simple ou la sortie du mode itinéraire.
   * @returns {void}
   */
  init() {
    this.element = document.createElement("div");
    this.element.className = "route-details-modal hidden";
    this.element.innerHTML = `
            <div class="rd-header">
                <h3><i class="fas fa-route"></i> Détail du trajet</h3>
                <button class="rd-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="rd-content"></div>
            <div class="rd-footer">
                <div id="rd-total-time" style="margin-bottom:10px;"></div>
                
                <button id="btn-exit-route" style="width:100%; padding:10px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">
                    <i class="fas fa-times-circle"></i> Quitter l'itinéraire
                </button>
            </div>
        `;
    this.parent.appendChild(this.element);

    this.element
      .querySelector(".rd-close")
      .addEventListener("click", () => this.hide());

    this.element
      .querySelector("#btn-exit-route")
      .addEventListener("click", () => {
        if (this.onExitCallback) this.onExitCallback();
      });
  }

  /**
   * Définit le callback à exécuter lorsque l'utilisateur clique sur le bouton "Quitter l'itinéraire".
   * Permet au contrôleur principal de nettoyer la carte (supprimer le tracé).
   * @param {Function} callback - La fonction de callback.
   * @returns {void}
   */
  setOnExit(callback) {
    this.onExitCallback = callback;
  }

  /**
   * Remplit le widget avec les données de l'itinéraire calculé et l'affiche à l'écran.
   * Génère dynamiquement la liste des étapes avec les icônes et couleurs appropriées selon le mode de transport.
   * @param {Object} pathData - Les données du chemin (tableau d'étapes et durée totale).
   * @returns {void}
   */
  show(pathData) {
    const container = this.element.querySelector(".rd-content");
    container.innerHTML = pathData.path
      .map((step, i) => {
        if (step.type === "DEPART") return "";

        let icon = "fas fa-walking";
        let color = "#7f8c8d";

        if (step.type.includes("METRO")) {
          icon = "fas fa-subway";
          color = "#27ae60";
        }
        if (step.type.includes("BUS")) {
          icon = "fas fa-bus";
          color = "#2980b9";
        }
        if (step.type.includes("TRAM")) {
          icon = "fas fa-train";
          color = "#8e44ad";
        }

        return `
                <div class="rd-step">
                    <div class="step-icon" style="background:${color}"><i class="${icon}"></i></div>
                    <div class="step-info">
                        <strong>${step.line}</strong> vers ${step.name}
                    </div>
                </div>
            `;
      })
      .join("");

    const totalMin = Math.round(pathData.totalDuration / 60);
    this.element.querySelector(
      "#rd-total-time"
    ).innerHTML = `Temps total estimé : <b>${totalMin} min</b>`;

    this.element.classList.remove("hidden");
  }

  /**
   * Masque le widget de détails sans détruire son contenu.
   * @returns {void}
   */
  hide() {
    this.element.classList.add("hidden");
  }
}

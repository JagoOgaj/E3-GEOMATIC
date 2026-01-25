/**
 * Composant d'interface utilisateur responsable de l'affichage détaillé de l'itinéraire.
 * Se présente sous forme d'une fenêtre modale ("timeline") listant chaque étape du trajet :
 * mode de transport, durée, direction, arrêts intermédiaires et changements.
 *
 * Ce composant gère uniquement l'affichage (Vue) et délègue l'action de quitter
 * l'itinéraire via un callback externe.
 */
export class RouteDetailsComponent {
  constructor() {
    this.parent = document.body;
    this.element = null;
    this.onExitCallback = null;
  }

  /**
   * Initialise le composant en créant la structure DOM complète de la modale.
   * Injecte le HTML dans le document et configure les écouteurs d'événements
   * pour le bouton de fermeture (croix) et le bouton "Quitter l'itinéraire".
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
                <div id="rd-total-time" class="total-time-badge"></div>
                <button id="btn-exit-route" class="btn-exit">
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
   * Définit la fonction de rappel à exécuter lorsque l'utilisateur clique sur
   * le bouton "Quitter l'itinéraire".
   * @param {Function} callback - La fonction à appeler pour sortir du mode itinéraire.
   */
  setOnExit(callback) {
    this.onExitCallback = callback;
  }

  /**
   * Helper pour formater les secondes en format lisible (min ou h + min).
   * @param {number} seconds - Durée en secondes.
   * @returns {string} - Chaine formatée (ex: "45 min" ou "1 h 15 min").
   */
  #formatDuration(seconds) {
    const totalMinutes = Math.round(seconds / 60);

    if (totalMinutes < 60) {
      return `${totalMinutes || 1} min`;
    }

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    const mStr = m < 10 ? `0${m}` : m;

    return `${h} h ${mStr} min`;
  }

  /**
   * Génère et affiche les détails du trajet à partir des données fournies.
   * Cette méthode transforme les données brutes du chemin (PathFinder) en éléments visuels HTML,
   * en appliquant une logique de présentation spécifique selon le type de transport.
   *
   * @param {Object} pathData - L'objet contenant les données du chemin.
   * @param {number} pathData.totalDuration - La durée totale en secondes.
   * @param {Array} pathData.path - La liste des étapes (segments) du trajet.
   */
  show(pathData) {
    const container = this.element.querySelector(".rd-content");

    const formattedTotal = this.#formatDuration(pathData.totalDuration);

    this.element.querySelector("#rd-total-time").innerHTML =
      `<span>Durée totale : </span><b>${formattedTotal}</b>`;

    container.innerHTML = pathData.path
      .map((step, i) => {
        if (step.type === "DEPART") return "";

        let icon = "fas fa-walking";
        let color = "#95a5a6";
        let modeLabel = "Marche";
        let isWalk = true;

        if (step.type.includes("METRO")) {
          icon = "fas fa-subway";
          color = "#27ae60";
          modeLabel = "Métro";
          isWalk = false;
        } else if (step.type.includes("BUS")) {
          icon = "fas fa-bus";
          color = "#2980b9";
          modeLabel = "Bus";
          isWalk = false;
        } else if (step.type.includes("TRAM")) {
          icon = "fas fa-train";
          color = "#8e44ad";
          modeLabel = "Tram";
          isWalk = false;
        } else if (step.type.includes("TRAIN") || step.type.includes("RER")) {
          icon = "fas fa-train";
          color = "#e67e22";
          modeLabel = "Train";
          isWalk = false;
        }

        const formattedStepDuration = this.#formatDuration(step.weight);

        const stopsInfo =
          !isWalk && step.stopsCount > 0
            ? `<span class="badge-stops">${step.stopsCount} arrêt${step.stopsCount > 1 ? "s" : ""}</span>`
            : "";

        const lineBadge = !isWalk
          ? `<span class="line-badge" style="background:${color}">${step.line}</span>`
          : "";

        let mainText = "";
        let subText = "";

        if (isWalk) {
          mainText = `Marcher vers <strong>${step.name}</strong>`;
        } else {
          const direction = step.headsign ? `Dir. ${step.headsign}` : "";
          mainText = `${lineBadge} ${direction}`;
          subText = `Descendre à : <strong>${step.name}</strong>`;
        }

        return `
            <div class="rd-step-item">
                <div class="step-left-col">
                    <div class="step-icon-bubble" style="background:${color}">
                        <i class="${icon}"></i>
                    </div>
                    <div class="step-line-connector"></div>
                </div>
                
                <div class="step-right-col">
                    <div class="step-header">
                        <span class="step-mode">${modeLabel}</span>
                        <span class="step-duration"><i class="far fa-clock"></i> ${formattedStepDuration}</span>
                    </div>
                    
                    <div class="step-body">
                        <div class="step-main-text">${mainText}</div>
                        ${subText ? `<div class="step-sub-text">${subText}</div>` : ""}
                        ${stopsInfo ? `<div class="step-meta">${stopsInfo}</div>` : ""}
                    </div>
                </div>
            </div>
        `;
      })
      .join("");

    this.element.classList.remove("hidden");
  }

  /**
   * Masque la modale de détails en lui appliquant la classe CSS de dissimulation.
   * Ne détruit pas le composant du DOM, permettant une réouverture rapide.
   */
  hide() {
    this.element.classList.add("hidden");
  }
}

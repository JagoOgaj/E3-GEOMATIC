/**
 * Component simple affichant un bouton flottant permettant de masquer les stations de transport
 * lorsqu'elles sont affichées sur la carte depuis la modale de détail.
 * * Dépendances :
 * @param {string} parentId - L'ID de l'élément DOM parent (ex: 'ui-layer').
 */
export class TransportComponent {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        this.element = null;
        this.onClick = null; 
    }

    /**
     * Construit le DOM du widget (bouton de fermeture), l'injecte dans le parent
     * et configure l'écouteur d'événement au clic.
     * @returns {void}
     */
    init() {
        this.element = document.createElement('div');
        
        this.element.className = 'transport-widget widget-hidden';
        this.element.title = "Masquer les transports";
        
        this.element.innerHTML = `
            <button class="transport-close-btn">
                <i class="fas fa-bus-alt" style="margin-right:5px"></i> 
                <i class="fas fa-times"></i>
            </button>
        `;

        this.parent.appendChild(this.element);

        this.element.addEventListener('click', () => {
            if (this.onClick) this.onClick();
        });
    }

    /**
     * Affiche le widget à l'écran en retirant la classe de masquage.
     * @returns {void}
     */
    show() {
        this.element.classList.remove('widget-hidden');
    }

    /**
     * Masque le widget de l'écran en ajoutant la classe de masquage CSS.
     * @returns {void}
     */
    hide() {
        this.element.classList.add('widget-hidden');
    }
}
/**
 * Implémentation d'une file de priorité (Min-Heap) sous forme d'arbre binaire.
 * Cette structure de données est optimisée pour l'algorithme A* afin de récupérer
 * efficacement le nœud ayant le coût total ('f') le plus faible.
 * * Dépendances : Aucune.
 */
export class MinHeap {
  constructor() {
    this.heap = [];
  }

  /**
   * Ajoute un nouveau nœud dans la file et réorganise le tas pour maintenir l'ordre.
   * @param {Object} node - L'objet nœud à ajouter (doit contenir une propriété 'f').
   * @returns {void}
   */
  push(node) {
    this.heap.push(node);
    this.#bubbleUp();
  }

  /**
   * Retire et retourne le nœud ayant la plus petite valeur 'f' (la racine du tas).
   * Réorganise ensuite le tas pour combler le vide.
   * @returns {Object|null} Le nœud avec le coût le plus faible, ou null si la file est vide.
   */
  pop() {
    if (this.isEmpty()) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (!this.isEmpty()) {
      this.heap[0] = last;
      this.#bubbleDown();
    }
    return min;
  }

  /**
   * Vérifie si la file de priorité est vide.
   * @returns {boolean} True si vide, False sinon.
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Méthode privée. Fait remonter le dernier élément ajouté vers sa position correcte
   * en l'échangeant avec son parent tant que son coût 'f' est inférieur.
   * @returns {void}
   */
  #bubbleUp() {
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[index].f >= this.heap[parent].f) break;
      [this.heap[index], this.heap[parent]] = [
        this.heap[parent],
        this.heap[index],
      ];
      index = parent;
    }
  }

  /**
   * Méthode privée. Fait redescendre la nouvelle racine vers sa position correcte
   * en l'échangeant avec le plus petit de ses enfants tant que l'ordre n'est pas rétabli.
   * @returns {void}
   */
  #bubbleDown() {
    let index = 0;
    while (true) {
      let left = 2 * index + 1,
        right = 2 * index + 2,
        smallest = index;
      if (left < this.heap.length && this.heap[left].f < this.heap[smallest].f)
        smallest = left;
      if (
        right < this.heap.length &&
        this.heap[right].f < this.heap[smallest].f
      )
        smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}

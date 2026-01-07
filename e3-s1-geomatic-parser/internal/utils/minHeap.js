/**
 * Implémentation d'une file de priorité (Min-Heap) binaire.
 * Spécialisée pour l'algorithme A* : elle organise les nœuds en fonction de leur score 'f' (coût total).
 *
 * Complexité :
 * - push : O(log n)
 * - pop : O(log n)
 * - peek : O(1)
 */
export class MinHeap {
  constructor() {
    this.heap = [];
  }

  /**
   * Ajoute un nœud dans la file et réorganise l'arbre.
   * @param {Object} node - Le nœud à ajouter (doit avoir une propriété .f numérique).
   */
  push(node) {
    this.heap.push(node);
    this.#bubbleUp(this.heap.length - 1);
  }

  /**
   * Retire et retourne le nœud avec le score 'f' le plus bas (la racine).
   * @returns {Object|null} Le nœud minimal ou null si vide.
   */
  pop() {
    if (this.heap.length === 0) return null;

    const minNode = this.heap[0];
    const lastNode = this.heap.pop();

    if (this.heap.length > 0) {
      this.heap[0] = lastNode;
      this.#sinkDown(0);
    }

    return minNode;
  }

  /**
   * Vérifie si la file est vide.
   * @returns {boolean} True si vide, sinon False.
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Fait remonter un nœud vers la racine tant qu'il est plus petit que son parent.
   * @param {number} index - L'index du nœud à faire remonter.
   * @private
   */
  #bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.heap[index].f >= this.heap[parentIndex].f) break;

      this.#swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Fait descendre un nœud vers les feuilles tant qu'il est plus grand que ses enfants.
   * @param {number} index - L'index du nœud à faire descendre.
   * @private
   */
  #sinkDown(index) {
    const length = this.heap.length;

    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let smallestIndex = index;

      if (
        leftChildIndex < length &&
        this.heap[leftChildIndex].f < this.heap[smallestIndex].f
      ) {
        smallestIndex = leftChildIndex;
      }

      if (
        rightChildIndex < length &&
        this.heap[rightChildIndex].f < this.heap[smallestIndex].f
      ) {
        smallestIndex = rightChildIndex;
      }

      if (smallestIndex === index) break;

      this.#swap(index, smallestIndex);
      index = smallestIndex;
    }
  }

  /**
   * Échange deux éléments dans le tableau interne.
   * @param {number} i - Premier index.
   * @param {number} j - Deuxième index.
   * @private
   */
  #swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

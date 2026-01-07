/**
 * File de priorité (Min-Heap) générique.
 * Contrairement à la classe MinHeap (spécialisée pour les nœuds A*),
 * celle-ci peut gérer n'importe quel élément associé à une priorité numérique.
 */
export default class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  /**
   * Ajoute un élément dans la file avec une priorité donnée.
   * La priorité la plus basse sera traitée en premier (Min-Heap).
   * @param {any} element - L'objet ou la valeur à stocker.
   * @param {number} priority - La valeur numérique de priorité (plus petit = plus urgent).
   */
  enqueue(element, priority) {
    const node = { element, priority };
    this.heap.push(node);
    this.#bubbleUp(this.heap.length - 1);
  }

  /**
   * Retire et retourne l'élément ayant la plus haute priorité (valeur la plus basse).
   * @returns {{element: any, priority: number} | null} L'objet wrapper ou null si vide.
   */
  dequeue() {
    if (this.isEmpty()) return null;

    const min = this.heap[0];
    const end = this.heap.pop();

    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.#sinkDown(0);
    }

    return min;
  }

  /**
   * Vérifie si la file est vide.
   * @returns {boolean} True si vide, sinon False.
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Fait remonter un élément vers la racine pour rétablir l'ordre du tas.
   * @param {number} index - L'index de l'élément à faire remonter.
   * @private
   */
  #bubbleUp(index) {
    const element = this.heap[index];

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];

      if (element.priority >= parent.priority) break;

      this.heap[parentIndex] = element;
      this.heap[index] = parent;

      index = parentIndex;
    }
  }

  /**
   * Fait descendre un élément vers le bas pour rétablir l'ordre du tas.
   * @param {number} index - L'index de l'élément à faire descendre.
   * @private
   */
  #sinkDown(index) {
    const length = this.heap.length;
    const element = this.heap[index];

    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let swapIndex = null;

      if (leftChildIndex < length) {
        const leftChild = this.heap[leftChildIndex];
        if (leftChild.priority < element.priority) {
          swapIndex = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.heap[rightChildIndex];
        const currentPriorityToBeat =
          swapIndex === null
            ? element.priority
            : this.heap[leftChildIndex].priority;

        if (rightChild.priority < currentPriorityToBeat) {
          swapIndex = rightChildIndex;
        }
      }

      if (swapIndex === null) break;

      this.heap[index] = this.heap[swapIndex];
      this.heap[swapIndex] = element;

      index = swapIndex;
    }
  }
}

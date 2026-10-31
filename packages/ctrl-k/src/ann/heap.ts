export class MinHeap<T> {
  private heap: Array<{ val: number; item: T }> = [];

  push(val: number, item: T): void {
    this.heap.push({ val, item });
    let i = this.heap.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p]!.val <= this.heap[i]!.val) break;
      [this.heap[p], this.heap[i]] = [this.heap[i]!, this.heap[p]!];
      i = p;
    }
  }

  pop(): { val: number; item: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const root = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < n && this.heap[left]!.val < this.heap[smallest]!.val) {
          smallest = left;
        }
        if (right < n && this.heap[right]!.val < this.heap[smallest]!.val) {
          smallest = right;
        }
        if (smallest === i) break;
        [this.heap[i], this.heap[smallest]] = [
          this.heap[smallest]!,
          this.heap[i]!,
        ];
        i = smallest;
      }
    }
    return root;
  }

  peek(): { val: number; item: T } | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  clear(): void {
    this.heap = [];
  }
}

export class MaxHeap<T> {
  private heap: Array<{ val: number; item: T }> = [];

  push(val: number, item: T): void {
    this.heap.push({ val, item });
    let i = this.heap.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p]!.val >= this.heap[i]!.val) break;
      [this.heap[p], this.heap[i]] = [this.heap[i]!, this.heap[p]!];
      i = p;
    }
  }

  pop(): { val: number; item: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const root = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      while (true) {
        let largest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < n && this.heap[left]!.val > this.heap[largest]!.val) {
          largest = left;
        }
        if (right < n && this.heap[right]!.val > this.heap[largest]!.val) {
          largest = right;
        }
        if (largest === i) break;
        [this.heap[i], this.heap[largest]] = [
          this.heap[largest]!,
          this.heap[i]!,
        ];
        i = largest;
      }
    }
    return root;
  }

  peek(): { val: number; item: T } | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  clear(): void {
    this.heap = [];
  }
}

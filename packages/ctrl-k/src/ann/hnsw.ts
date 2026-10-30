import { cosineSimilarity } from "../search";
import { MaxHeap, MinHeap } from "./heap";

export type HnswNode = {
  id: string;
  vector: Float32Array;
  level: number;
  neighbors: Map<number, Set<string>>;
};

export type HnswConfig = {
  m: number;
  efConstruction: number;
  efSearch: number;
  maxLevel: number;
};

const DEFAULT_CONFIG: HnswConfig = {
  m: 16,
  efConstruction: 200,
  efSearch: 50,
  maxLevel: 6,
};

function getRandomLevel(maxLevel: number): number {
  let level = 0;
  while (Math.random() < 0.5 && level < maxLevel) {
    level++;
  }
  return level;
}

export class HnswIndex {
  private nodes = new Map<string, HnswNode>();
  private entryPoint: string | null = null;
  private config: HnswConfig;

  constructor(config: Partial<HnswConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addNode(id: string, vector: Float32Array): void {
    const level = getRandomLevel(this.config.maxLevel);
    const node: HnswNode = {
      id,
      vector,
      level,
      neighbors: new Map(),
    };

    for (let l = 0; l <= level; l++) {
      node.neighbors.set(l, new Set());
    }

    this.nodes.set(id, node);

    if (this.entryPoint === null) {
      this.entryPoint = id;
      return;
    }

    const entry = this.nodes.get(this.entryPoint)!;
    let curr = entry;

    for (let l = Math.min(entry.level, level); l > level; l--) {
      curr = this.findClosest(curr, node, l);
    }

    for (let l = 0; l <= level; l++) {
      const neighbors = this.searchLayer(
        node,
        curr,
        this.config.efConstruction,
        l,
      );
      const mL = l === 0 ? this.config.m * 2 : this.config.m;
      const selected = this.selectNeighbors(neighbors, mL);

      const nodeNeighbors = node.neighbors.get(l)!;
      for (const neighbor of selected) {
        nodeNeighbors.add(neighbor.id);
        const neighborNode = this.nodes.get(neighbor.id)!;
        if (!neighborNode.neighbors.has(l)) {
          neighborNode.neighbors.set(l, new Set());
        }
        const neighborNeighbors = neighborNode.neighbors.get(l)!;
        neighborNeighbors.add(id);
        if (neighborNeighbors.size > mL) {
          const allNeighbors = Array.from(neighborNeighbors).map((nid) => ({
            id: nid,
            node: this.nodes.get(nid)!,
          }));
          allNeighbors.sort(
            (a, b) =>
              cosineSimilarity(neighborNode.vector, b.node.vector) -
              cosineSimilarity(neighborNode.vector, a.node.vector),
          );
          neighborNeighbors.clear();
          for (let i = 0; i < mL && i < allNeighbors.length; i++) {
            neighborNeighbors.add(allNeighbors[i]!.id);
          }
        }
      }
    }

    if (level > entry.level) {
      this.entryPoint = id;
    }
  }

  private findClosest(
    curr: HnswNode,
    query: HnswNode,
    level: number,
  ): HnswNode {
    let changed = true;
    while (changed) {
      changed = false;
      const neighbors = curr.neighbors.get(level);
      if (!neighbors) break;
      for (const nid of neighbors) {
        const neighbor = this.nodes.get(nid)!;
        if (
          cosineSimilarity(query.vector, neighbor.vector) >
          cosineSimilarity(query.vector, curr.vector)
        ) {
          curr = neighbor;
          changed = true;
          break;
        }
      }
    }
    return curr;
  }

  private searchLayer(
    query: HnswNode,
    entryPoint: HnswNode,
    ef: number,
    level: number,
  ): Array<{ id: string; node: HnswNode; dist: number }> {
    const visited = new Set<string>([entryPoint.id]);
    const candidates = new MinHeap<string>();
    const resultHeap = new MaxHeap<string>();

    const dist = (a: Float32Array, b: Float32Array) =>
      1 - cosineSimilarity(a, b);

    const entryDist = dist(query.vector, entryPoint.vector);
    candidates.push(entryDist, entryPoint.id);
    resultHeap.push(entryDist, entryPoint.id);

    const resultMap = new Map<string, number>();
    resultMap.set(entryPoint.id, entryDist);

    while (!candidates.isEmpty()) {
      const current = candidates.pop();
      if (!current) break;

      const furthest = resultHeap.peek();
      if (furthest && current.val > furthest.val && resultMap.size >= ef) {
        break;
      }

      const curr = this.nodes.get(current.item)!;
      const neighbors = curr.neighbors.get(level);
      if (!neighbors) continue;

      for (const nid of neighbors) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const neighbor = this.nodes.get(nid)!;
        const d = dist(query.vector, neighbor.vector);
        const furthestResult = resultHeap.peek();

        if (resultMap.size < ef || (furthestResult && d < furthestResult.val)) {
          candidates.push(d, nid);
          resultHeap.push(d, nid);
          resultMap.set(nid, d);

          if (resultMap.size > ef) {
            const removed = resultHeap.pop();
            if (removed) {
              resultMap.delete(removed.item);
            }
          }
        }
      }
    }

    const results: Array<{ id: string; node: HnswNode; dist: number }> = [];
    for (const [id, d] of resultMap) {
      results.push({ id, node: this.nodes.get(id)!, dist: d });
    }
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  private selectNeighbors(
    neighbors: Array<{ id: string; node: HnswNode; dist: number }>,
    m: number,
  ): Array<{ id: string; node: HnswNode; dist: number }> {
    return neighbors.slice(0, m);
  }

  search(query: Float32Array, k: number): Array<{ id: string; score: number }> {
    if (this.nodes.size === 0 || this.entryPoint === null) {
      return [];
    }

    const entry = this.nodes.get(this.entryPoint)!;
    let curr = entry;

    for (let l = entry.level; l > 0; l--) {
      curr = this.findClosest(curr, { vector: query } as HnswNode, l);
    }

    const queryNode = { vector: query } as HnswNode;
    const results = this.searchLayer(queryNode, curr, this.config.efSearch, 0);

    return results.slice(0, k).map((r) => ({
      id: r.id,
      score: 1 - r.dist,
    }));
  }

  size(): number {
    return this.nodes.size;
  }

  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
  }
}

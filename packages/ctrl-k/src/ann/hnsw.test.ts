import { describe, expect, test } from "bun:test";
import { HnswIndex } from "./hnsw";

describe("HnswIndex", () => {
  test("adds nodes and searches", () => {
    const index = new HnswIndex({ m: 4, efConstruction: 50, efSearch: 20 });
    const v1 = Float32Array.from([1, 0, 0]);
    const v2 = Float32Array.from([0.9, 0.1, 0]);
    const v3 = Float32Array.from([0, 1, 0]);
    index.addNode("a", v1);
    index.addNode("b", v2);
    index.addNode("c", v3);
    const results = index.search(Float32Array.from([1, 0, 0]), 2);
    expect(results.length).toBe(2);
    expect(results[0]!.id).toBe("a");
    expect(results[0]!.score).toBeGreaterThan(0.9);
  });

  test("handles empty index", () => {
    const index = new HnswIndex();
    const results = index.search(Float32Array.from([1, 0]), 5);
    expect(results).toEqual([]);
  });

  test("respects k parameter", () => {
    const index = new HnswIndex();
    for (let i = 0; i < 10; i++) {
      index.addNode(`n${i}`, Float32Array.from([Math.random(), Math.random()]));
    }
    const results = index.search(Float32Array.from([0.5, 0.5]), 3);
    expect(results.length).toBe(3);
  });
});

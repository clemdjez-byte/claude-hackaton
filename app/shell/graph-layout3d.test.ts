import { describe, it, expect } from "vitest";
import { graphLayout3D } from "./graph-layout3d";
import type { GEdge } from "./galaxy-layout";

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("graphLayout3D", () => {
  it("liste vide → liste vide, un seul nœud → origine", () => {
    expect(graphLayout3D([], [])).toEqual([]);
    expect(graphLayout3D(["a"], [])).toEqual([[0, 0, 0]]);
  });

  it("déterministe : deux appels identiques → sorties strictement égales", () => {
    const ids = ["a", "b", "c", "d"];
    const edges: GEdge[] = [{ from: "a", to: "b" }, { from: "c", to: "d" }];
    expect(graphLayout3D(ids, edges)).toEqual(graphLayout3D(ids, edges));
  });

  it("coords finies et bornées dans [-1, 1]", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const edges: GEdge[] = [{ from: "a", to: "b" }, { from: "b", to: "c" }];
    for (const p of graphLayout3D(ids, edges)) {
      for (const c of p) {
        expect(Number.isFinite(c)).toBe(true);
        expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("deux nœuds reliés finissent plus proches que deux non-reliés", () => {
    // a-b reliés ; c et d isolés (repoussés au loin).
    const ids = ["a", "b", "c", "d"];
    const edges: GEdge[] = [{ from: "a", to: "b" }];
    const out = graphLayout3D(ids, edges);
    const byId = Object.fromEntries(ids.map((id, i) => [id, out[i]]));
    expect(dist(byId.a, byId.b)).toBeLessThan(dist(byId.c, byId.d));
  });

  it("graphe déconnecté (aucune arête) → coords finies, pas de collapse", () => {
    const ids = ["a", "b", "c"];
    const out = graphLayout3D(ids, []);
    for (const p of out) for (const c of p) expect(Number.isFinite(c)).toBe(true);
    // la répulsion écarte les points → au moins deux distincts
    expect(dist(out[0], out[1])).toBeGreaterThan(0);
  });

  it("ignore les arêtes qui pointent hors de la liste des nœuds", () => {
    const ids = ["a", "b"];
    const edges: GEdge[] = [{ from: "a", to: "zzz" }, { from: "a", to: "b" }];
    const out = graphLayout3D(ids, edges);
    expect(out).toHaveLength(2);
    for (const p of out) for (const c of p) expect(Number.isFinite(c)).toBe(true);
  });
});

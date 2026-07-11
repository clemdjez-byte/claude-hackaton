import { describe, it, expect } from "vitest";
import { layoutNodes, type GNode } from "./galaxy-layout";

const protocolA: GNode = { id: "pg_a", kind: "protocol", label: "Protocol A", params: { protocolId: "pg_a" } };
const protocolB: GNode = { id: "pg_b", kind: "protocol", label: "Protocol B", params: { protocolId: "pg_b" } };
const runA: GNode = { id: "run_a", kind: "run", label: "Run A", params: { runId: "run_a" } };
const runB: GNode = { id: "run_b", kind: "run", label: "Run B", params: { runId: "run_b" } };
const reportA: GNode = { id: "pg_r1", kind: "report", label: "Report A", params: { runId: "run_a" } };

describe("layoutNodes", () => {
  it("même entrée → mêmes coordonnées (déterminisme)", () => {
    const nodes = [protocolA, runA, reportA, protocolB, runB];
    const a = layoutNodes(nodes);
    const b = layoutNodes(nodes);
    expect(a).toEqual(b);
  });

  it("déterministe même si l'ordre d'entrée change (pas dépendant de l'ordre du tableau)", () => {
    const a = layoutNodes([protocolA, runA, reportA, protocolB, runB]);
    const b = layoutNodes([runB, reportA, protocolB, runA, protocolA]);
    const byId = (list: typeof a) => Object.fromEntries(list.map((n) => [n.id, { x: n.x, y: n.y }]));
    expect(byId(a)).toEqual(byId(b));
  });

  it("N nœuds → N positions distinctes", () => {
    const nodes = [protocolA, protocolB, runA, runB, reportA];
    const out = layoutNodes(nodes);
    expect(out).toHaveLength(nodes.length);
    const positions = new Set(out.map((n) => `${n.x},${n.y}`));
    expect(positions.size).toBe(nodes.length);
  });

  it("protocoles au centre, runs au milieu, rapports en périphérie (rayons croissants)", () => {
    const out = layoutNodes([protocolA, runA, reportA]);
    const radius = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    const p = radius(out.find((n) => n.id === "pg_a")!);
    const r = radius(out.find((n) => n.id === "run_a")!);
    const rep = radius(out.find((n) => n.id === "pg_r1")!);
    expect(p).toBeLessThan(r);
    expect(r).toBeLessThan(rep);
  });

  it("liste vide → liste vide", () => {
    expect(layoutNodes([])).toEqual([]);
  });

  it("un seul nœud par anneau ne casse rien (angle 0, pas de division par zéro)", () => {
    const out = layoutNodes([protocolA]);
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0].x)).toBe(true);
    expect(Number.isFinite(out[0].y)).toBe(true);
  });

  it("conserve les champs du nœud (kind, label, params) en plus de x/y", () => {
    const out = layoutNodes([reportA]);
    expect(out[0]).toMatchObject({ id: "pg_r1", kind: "report", label: "Report A", params: { runId: "run_a" } });
  });
});

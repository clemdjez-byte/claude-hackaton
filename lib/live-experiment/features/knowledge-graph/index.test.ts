import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "../../core";
import { createDb } from "../../adapters.standalone";
import { link, neighbors, subgraph, type KgNode } from "./index";

beforeAll(() => {
  process.env.FEATURE_KNOWLEDGE_GRAPH = "true";
});

function db(): Db {
  return createDb(":memory:");
}

// Petit graphe témoin : run -ran_protocol-> protocol -uses_reagent-> reagent.
const RUN: KgNode = { type: "run", id: "run_1" };
const PROTOCOL: KgNode = { type: "protocol", id: "pg_1" };
const REAGENT: KgNode = { type: "reagent", id: "rg_1" };

async function seedGraphe(d: Db): Promise<void> {
  await link(d, "lab1", RUN, "ran_protocol", PROTOCOL);
  await link(d, "lab1", PROTOCOL, "uses_reagent", REAGENT);
}

describe("Knowledge Graph", () => {
  it("link crée une arête typée orientée", async () => {
    const d = db();
    const edge = await link(d, "lab1", RUN, "ran_protocol", PROTOCOL);
    expect(edge.id).toMatch(/^kg_/);
    expect(edge.ws).toBe("lab1");
    expect(edge.relation).toBe("ran_protocol");
    expect(edge.fromType).toBe("run");
    expect(edge.fromId).toBe("run_1");
    expect(edge.toType).toBe("protocol");
    expect(edge.toId).toBe("pg_1");
    d.close();
  });

  it("neighbors renvoie les voisins sortants ET entrants", async () => {
    const d = db();
    await seedGraphe(d);

    // protocol a un entrant (run) et un sortant (reagent).
    const voisins = await neighbors(d, "lab1", PROTOCOL);
    expect(voisins.length).toBe(2);

    const sortant = voisins.find((v) => v.direction === "out");
    expect(sortant?.node).toEqual(REAGENT);
    expect(sortant?.relation).toBe("uses_reagent");

    const entrant = voisins.find((v) => v.direction === "in");
    expect(entrant?.node).toEqual(RUN);
    expect(entrant?.relation).toBe("ran_protocol");

    d.close();
  });

  it("neighbors filtre par relation", async () => {
    const d = db();
    await seedGraphe(d);
    const filtres = await neighbors(d, "lab1", PROTOCOL, "uses_reagent");
    expect(filtres.length).toBe(1);
    expect(filtres[0].node).toEqual(REAGENT);
    expect(filtres[0].direction).toBe("out");
    d.close();
  });

  it("subgraph depth=1 ne remonte que les voisins directs", async () => {
    const d = db();
    await seedGraphe(d);
    const sg = await subgraph(d, "lab1", RUN, 1);
    // run + protocol seulement (reagent est à 2 sauts).
    expect(sg.nodes.length).toBe(2);
    expect(sg.edges.length).toBe(1);
    expect(sg.nodes).toContainEqual(RUN);
    expect(sg.nodes).toContainEqual(PROTOCOL);
    d.close();
  });

  it("subgraph depth=2 atteint les nœuds à deux sauts", async () => {
    const d = db();
    await seedGraphe(d);
    const sg = await subgraph(d, "lab1", RUN, 2);
    // run + protocol + reagent.
    expect(sg.nodes.length).toBe(3);
    expect(sg.edges.length).toBe(2);
    expect(sg.nodes).toContainEqual(REAGENT);
    d.close();
  });

  it("subgraph déduplique nœuds et arêtes malgré les chemins multiples", async () => {
    const d = db();
    await seedGraphe(d);
    // Deuxième chemin vers reagent : run -measured_with-> reagent.
    await link(d, "lab1", RUN, "measured_with", REAGENT);

    const sg = await subgraph(d, "lab1", RUN, 2);
    // reagent atteignable par 2 chemins mais compté une fois → 3 nœuds.
    expect(sg.nodes.length).toBe(3);
    // 3 arêtes distinctes, aucune doublée.
    expect(sg.edges.length).toBe(3);
    const ids = sg.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    d.close();
  });

  it("respecte le flag (désactivé → throw)", async () => {
    const d = db();
    process.env.FEATURE_KNOWLEDGE_GRAPH = "";
    await expect(link(d, "lab1", RUN, "ran_protocol", PROTOCOL)).rejects.toThrow();
    await expect(neighbors(d, "lab1", RUN)).rejects.toThrow();
    await expect(subgraph(d, "lab1", RUN, 1)).rejects.toThrow();
    process.env.FEATURE_KNOWLEDGE_GRAPH = "true";
    d.close();
  });
});

// lib/retrieval/knowledge-graph/resolve.test.ts — réconciliation de l'ontologie ouverte.
import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "@/lib/core";
import { reconcileAndLink, loadKnownEntities } from "./resolve";
import { NODE } from "./ontology";
import type { OpenGraph } from "./extract";

beforeEach(() => { process.env.FEATURE_KNOWLEDGE_GRAPH = "true"; });

describe("reconcileAndLink", () => {
  it("fusionne un synonyme via alias au lieu de créer un doublon", async () => {
    const db = createDb(":memory:");
    // Registre pré-existant : un réactif « MitoTracker » avec l'alias « mito tracker ».
    await db.upsertKgEntity({ ws: "demo", type: "reagent", key: "mitotracker", label: "MitoTracker", aliases: ["mito tracker"] });

    const g: OpenGraph = {
      entities: [{ id: "e1", type: "reagent", label: "Mito Tracker", aliases: [], value: null, unit: null }],
      triplets: [],
    };
    await reconcileAndLink(db, "demo", g);

    const reagents = await db.listKgEntities("demo", { type: "reagent" });
    expect(reagents).toHaveLength(1); // pas de doublon
    expect(reagents[0].key).toBe("mitotracker");
    expect(reagents[0].aliases).toContain("Mito Tracker"); // nouvel alias unionné
  });

  it("crée une facette neuve (instrument) et écrit les triplets", async () => {
    const db = createDb(":memory:");
    const g: OpenGraph = {
      entities: [
        { id: "e1", type: "run", label: "Run", aliases: [], value: null, unit: null },
        { id: "e2", type: "instrument", label: "Confocal Zeiss", aliases: ["zeiss"], value: null, unit: null },
      ],
      triplets: [{ subject: "e1", relation: "performed_on", object: "e2" }],
    };
    await reconcileAndLink(db, "demo", g, { pins: { run: "r1" } });

    // La facette run est épinglée → aucun kg_node "run" créé, seul l'instrument.
    expect(await db.listKgEntities("demo", { type: "run" })).toHaveLength(0);
    const insts = await db.listKgEntities("demo", { type: "instrument" });
    expect(insts).toHaveLength(1);
    expect(insts[0].key).toBe("confocal_zeiss");

    // Le triplet part du run RÉEL (r1) vers l'instrument canonique.
    const edges = await db.listEdges("demo", { relation: "performed_on" });
    expect(edges).toHaveLength(1);
    expect(edges[0].fromId).toBe("r1");
    expect(edges[0].toId).toBe("confocal_zeiss");
    expect(edges[0].provenance).toBe("extracted");
  });

  it("ignore un triplet dont une extrémité n'a pas résolu", async () => {
    const db = createDb(":memory:");
    const g: OpenGraph = {
      entities: [{ id: "e1", type: "instrument", label: "Confocal", aliases: [], value: null, unit: null }],
      triplets: [{ subject: "e1", relation: "uses", object: "e_inconnu" }],
    };
    await reconcileAndLink(db, "demo", g);
    expect(await db.listEdges("demo", { relation: "uses" })).toHaveLength(0);
  });

  it("filet de connectivité : rattache à l'ancre une entité non reliée", async () => {
    const db = createDb(":memory:");
    // L'IA n'a produit aucun triplet touchant le run → l'opérateur serait orphelin.
    const g: OpenGraph = {
      entities: [{ id: "e1", type: "operator", label: "Clément", aliases: [], value: null, unit: null }],
      triplets: [],
    };
    await reconcileAndLink(db, "demo", g, { anchor: NODE.run("r1"), anchorRelation: "involves" });
    const edges = await db.listEdges("demo", { fromId: "r1" });
    expect(edges).toHaveLength(1);
    expect(edges[0].relation).toBe("involves");
    expect(edges[0].toId).toBe("clement");
  });

  it("idempotent : ré-exécuter le même graphe ne duplique rien", async () => {
    const db = createDb(":memory:");
    const g: OpenGraph = {
      entities: [
        { id: "e1", type: "run", label: "Run", aliases: [], value: null, unit: null },
        { id: "e2", type: "instrument", label: "Confocal", aliases: [], value: null, unit: null },
      ],
      triplets: [{ subject: "e1", relation: "performed_on", object: "e2" }],
    };
    await reconcileAndLink(db, "demo", g, { pins: { run: "r1" } });
    await reconcileAndLink(db, "demo", g, { pins: { run: "r1" } });
    expect(await db.listKgEntities("demo", { type: "instrument" })).toHaveLength(1);
    expect(await db.listEdges("demo", { relation: "performed_on" })).toHaveLength(1);
  });
});

describe("loadKnownEntities", () => {
  it("agrège registre kg_node + vocabulaire de paramètres, borné", async () => {
    const db = createDb(":memory:");
    await db.upsertParameterType({ ws: "demo", key: "trypsination_time", label: "Temps de trypsination", unit: "min", aliases: [] });
    await db.upsertKgEntity({ ws: "demo", type: "instrument", key: "confocal", label: "Confocal", aliases: [] });
    const known = await loadKnownEntities(db, "demo");
    expect(known.some((k) => k.type === "parameter" && k.key === "trypsination_time")).toBe(true);
    expect(known.some((k) => k.type === "instrument" && k.key === "confocal")).toBe(true);
    expect((await loadKnownEntities(db, "demo", { cap: 1 })).length).toBe(1);
  });
});

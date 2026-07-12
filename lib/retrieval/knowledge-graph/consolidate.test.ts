// lib/retrieval/knowledge-graph/consolidate.test.ts — scan de dédoublonnage.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, configureLlm } from "@/lib/core";
import { link } from "./index";
import { consolidateGraph } from "./consolidate";
import type { Db } from "@/lib/core";

beforeEach(() => { process.env.FEATURE_KNOWLEDGE_GRAPH = "true"; });
afterEach(() => configureLlm(null));

// Deux nœuds réactifs fragmentés (clés différentes, même chose), chacun relié à un run.
async function seedFragmentedReagents(db: Db) {
  await db.upsertKgEntity({ ws: "demo", type: "reagent", key: "mitotracker", label: "MitoTracker", aliases: ["mito tracker"] });
  await db.upsertKgEntity({ ws: "demo", type: "reagent", key: "mito_tracker", label: "Mito Tracker", aliases: [] });
  await link(db, "demo", { type: "run", id: "r1" }, "uses", { type: "reagent", id: "mitotracker" }, { provenance: "extracted" });
  await link(db, "demo", { type: "run", id: "r2" }, "uses", { type: "reagent", id: "mito_tracker" }, { provenance: "extracted" });
}

describe("consolidateGraph — Tier 1 (déterministe, sans IA)", () => {
  it("fusionne « MitoTracker » et « Mito Tracker » et re-pointe les arêtes", async () => {
    const db = createDb(":memory:");
    configureLlm({ hasLlmKey: () => false, modelFor: () => ({}) as never, generateObjectFor: async () => { throw new Error("Tier 1 ne doit pas appeler l'IA"); }, generateProse: async () => "" });
    await seedFragmentedReagents(db);

    const report = await consolidateGraph(db, "demo");
    expect(report.llmUsed).toBe(false);
    expect(report.merges).toHaveLength(1);

    const reagents = await db.listKgEntities("demo", { type: "reagent" });
    expect(reagents).toHaveLength(1); // un seul nœud survivant
    expect(reagents[0].key).toBe("mitotracker"); // le plus riche en alias
    // Les deux arêtes pointent désormais vers le survivant.
    const edges = await db.listEdges("demo", { relation: "uses" });
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.toId === "mitotracker")).toBe(true);
    db.close();
  });
});

describe("consolidateGraph — Tier 2 (juge IA sur token partagé)", () => {
  async function seedDrugParams(db: Db) {
    await db.upsertKgEntity({ ws: "demo", type: "parameter", key: "quizartinib_concentration", label: "quizartinib concentration", aliases: [] });
    await db.upsertKgEntity({ ws: "demo", type: "parameter", key: "quizartinib_dose", label: "dose de quizartinib", aliases: [] });
  }

  it("fusionne quand le juge dit « même concept »", async () => {
    const db = createDb(":memory:");
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => ({}) as never,
      generateObjectFor: async () => ({ verdicts: [{ index: 0, same: true }] }) as never,
      generateProse: async () => "",
    });
    await seedDrugParams(db);
    const report = await consolidateGraph(db, "demo");
    expect(report.llmUsed).toBe(true);
    expect(report.candidatesConsidered).toBe(1); // la paire partage le token « quizartinib »
    expect(await db.listKgEntities("demo", { type: "parameter" })).toHaveLength(1);
    db.close();
  });

  it("NE fusionne PAS quand le juge dit « distinct » (conservateur)", async () => {
    const db = createDb(":memory:");
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => ({}) as never,
      generateObjectFor: async () => ({ verdicts: [{ index: 0, same: false }] }) as never,
      generateProse: async () => "",
    });
    await seedDrugParams(db);
    const report = await consolidateGraph(db, "demo");
    expect(report.merges).toHaveLength(0);
    expect(await db.listKgEntities("demo", { type: "parameter" })).toHaveLength(2);
    db.close();
  });

  it("fail-closed : sans clé LLM, ne touche pas aux candidats ambigus", async () => {
    const db = createDb(":memory:");
    configureLlm({ hasLlmKey: () => false, modelFor: () => ({}) as never, generateObjectFor: async () => { throw new Error("ne doit pas être appelé"); }, generateProse: async () => "" });
    await seedDrugParams(db);
    const report = await consolidateGraph(db, "demo");
    expect(report.llmUsed).toBe(false);
    expect(report.merges).toHaveLength(0);
    expect(await db.listKgEntities("demo", { type: "parameter" })).toHaveLength(2);
    db.close();
  });
});

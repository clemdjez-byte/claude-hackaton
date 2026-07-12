// lib/kg.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@/lib/core";
import { configureLlm } from "@/lib/core";
import { indexRunGraph } from "@/lib/kg";
import { REL } from "@/lib/retrieval/knowledge-graph/ontology";
import type { Outcome, Protocol, Run } from "@/lib/core";

const protocol = { id: "p1", ws: "demo", version: 1, title: "Marquage", status: "published", materials: [], parameters: [], steps: [], sources: [] } as Protocol;
const run = { id: "r1", ws: "demo", operator: "op", protocolId: "p1", protocolVersion: 1, status: "completed", scalingContext: {}, startedAt: "t0", endedAt: "t1" } as Run;

beforeEach(() => {
  // indexRunGraph lit le rapport (auto-report) et les preuves (evidence-capture)
  // pour nourrir l'extraction IA : les trois flags doivent être actifs ensemble,
  // comme dans la vraie vie d'un run qui atteint la clôture + verdict.
  process.env.FEATURE_KNOWLEDGE_GRAPH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_AUTO_REPORT = "true";
});
afterEach(() => configureLlm(null));

describe("indexRunGraph (voie IA)", () => {
  it("écrit les arêtes extraites par l'IA (mockée), dont une attribution qualitative", async () => {
    const db = createDb(":memory:");
    await db.insertEvidence({ runId: "r1", stepId: undefined, authorId: "op", kind: "note", body: "cellules non décollées" });
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => ({}) as never,
      generateObjectFor: async () =>
        ({ paramValues: [{ paramLabel: "Temps de trypsination", value: 2, unit: "min" }], reagents: [], cellLines: [],
           causes: [{ paramLabel: null, trigger: "cellules non décollées", mechanism: "trypsination trop courte", verdict: "failure" }] }) as never,
      generateProse: async () => "",
    });
    const outcome: Outcome = { id: "o1", ws: "demo", runId: "r1", verdict: "failure", createdAt: "t" };
    await indexRunGraph(db, run, [], protocol, outcome);

    const fromRun = await db.listEdges("demo", { fromId: "r1" });
    expect(fromRun.some((e) => e.relation === REL.instanceOf)).toBe(true);
    expect(fromRun.some((e) => e.relation === REL.hasValue)).toBe(true);
    const attr = await db.listEdges("demo", { relation: REL.attributedTo });
    expect(attr.length).toBe(1); // Outcome → FailureMode qualitatif créé à la volée
    db.close();
  });

  it("best-effort : flag off → ne jette pas, n'écrit rien", async () => {
    process.env.FEATURE_KNOWLEDGE_GRAPH = "false";
    const db = createDb(":memory:");
    const outcome: Outcome = { id: "o1", ws: "demo", runId: "r1", verdict: "failure", createdAt: "t" };
    await expect(indexRunGraph(db, run, [], protocol, outcome)).resolves.toBeUndefined();
    expect((await db.listEdges("demo")).length).toBe(0);
    db.close();
  });
});

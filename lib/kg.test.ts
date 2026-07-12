// lib/kg.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@/lib/core";
import { configureLlm } from "@/lib/core";
import { indexRunGraph } from "@/lib/kg";
import { REL } from "@/lib/retrieval/knowledge-graph/ontology";
import type { Protocol, Run } from "@/lib/core";

const protocol = { id: "p1", ws: "demo", version: 1, title: "Marquage", status: "published", materials: [], parameters: [], steps: [], sources: [] } as Protocol;
const run = { id: "r1", ws: "demo", operator: "op", protocolId: "p1", protocolVersion: 1, status: "completed", scalingContext: {}, startedAt: "t0", endedAt: "t1" } as Run;

beforeEach(() => {
  // indexRunGraph lit le rapport (auto-report) et les preuves (evidence-capture)
  // pour nourrir l'extraction IA : les trois flags doivent être actifs ensemble,
  // comme dans la vraie vie d'un run qui atteint la signature du rapport.
  process.env.FEATURE_KNOWLEDGE_GRAPH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_AUTO_REPORT = "true";
});
afterEach(() => configureLlm(null));

// Un seul mock, deux réponses : l'extraction du run (noyau chiffré, RUN_SYSTEM)
// et l'extraction ouverte (OPEN_SYSTEM) partagent la tâche "report" ; on les
// distingue par le system prompt.
function mockLlm() {
  configureLlm({
    hasLlmKey: () => true,
    modelFor: () => ({}) as never,
    generateObjectFor: async (_task, args: { system: string }) => {
      if (args.system.includes("GRAPHE DE CONNAISSANCES")) {
        return {
          entities: [
            { id: "e1", type: "run", label: "Run", aliases: [], value: null, unit: null },
            { id: "e2", type: "instrument", label: "Confocal Zeiss", aliases: [], value: null, unit: null },
          ],
          triplets: [{ subject: "e1", relation: "performed_on", object: "e2" }],
        } as never;
      }
      return {
        verdict: "failure",
        paramValues: [{ paramLabel: "Temps de trypsination", value: 2, unit: "min" }],
        reagents: [], cellLines: [],
        causes: [{ paramLabel: null, trigger: "cellules non décollées", mechanism: "trypsination trop courte", verdict: "failure" }],
      } as never;
    },
    generateProse: async () => "",
  });
}

describe("indexRunGraph (voie IA)", () => {
  it("noyau chiffré : verdict LU dans le texte + attribution qualitative", async () => {
    const db = createDb(":memory:");
    await db.insertEvidence({ runId: "r1", stepId: undefined, authorId: "op", kind: "note", body: "cellules non décollées" });
    mockLlm();
    await indexRunGraph(db, run, [], protocol);

    // Le verdict vient du texte (D4), pas d'un formulaire : Outcome créé.
    const outcome = await db.getOutcomeByRun("r1");
    expect(outcome?.verdict).toBe("failure");

    const fromRun = await db.listEdges("demo", { fromId: "r1" });
    expect(fromRun.some((e) => e.relation === REL.instanceOf)).toBe(true);
    expect(fromRun.some((e) => e.relation === REL.hasValue)).toBe(true);
    const attr = await db.listEdges("demo", { relation: REL.attributedTo });
    expect(attr.length).toBe(1); // Outcome → FailureMode qualitatif créé à la volée
    db.close();
  });

  it("ontologie ouverte : crée les nœuds objectifs et les relie au run réel", async () => {
    const db = createDb(":memory:");
    mockLlm();
    await indexRunGraph(db, run, [], protocol);

    // Nœud instrument créé dans le registre canonique.
    const insts = await db.listKgEntities("demo", { type: "instrument" });
    expect(insts.map((e) => e.key)).toContain("confocal_zeiss");

    // Triplet ouvert relié au run RÉEL (r1), pas à un doublon de run.
    const perf = await db.listEdges("demo", { relation: "performed_on" });
    expect(perf).toHaveLength(1);
    expect(perf[0].fromId).toBe("r1");
    expect(perf[0].toId).toBe("confocal_zeiss");
    db.close();
  });

  it("idempotent : ré-indexer (re-signature) ne duplique pas les arêtes ouvertes", async () => {
    const db = createDb(":memory:");
    mockLlm();
    await indexRunGraph(db, run, [], protocol);
    await indexRunGraph(db, run, [], protocol);
    expect(await db.listEdges("demo", { relation: "performed_on" })).toHaveLength(1);
    expect(await db.listKgEntities("demo", { type: "instrument" })).toHaveLength(1);
    db.close();
  });

  it("best-effort : flag off → ne jette pas, n'écrit rien", async () => {
    process.env.FEATURE_KNOWLEDGE_GRAPH = "false";
    const db = createDb(":memory:");
    await expect(indexRunGraph(db, run, [], protocol)).resolves.toBeUndefined();
    expect((await db.listEdges("demo")).length).toBe(0);
    db.close();
  });
});

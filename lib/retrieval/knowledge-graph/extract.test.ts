// lib/live-experiment/features/knowledge-graph/extract.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { configureLlm } from "@/lib/core";
import { extractProtocolOntology, extractOpenGraph } from "./extract";
import type { Protocol } from "@/lib/core";

const protocol: Protocol = {
  id: "p1", ws: "demo", version: 1, title: "Marquage", status: "published",
  summary: "Passage → marquage → fixation",
  materials: [], parameters: [], sources: [{ kind: "doi", ref: "10.1/x" }],
  steps: [
    { index: 0, title: "Trypsination", instruction: "3 min. ⚠️ < 3 min : cellules restent adhérentes (échec)" },
    { index: 1, title: "Fixation PFA", instruction: "max 10 min. ⚠️ > 10 min : marquage dégradé" },
  ],
};

afterEach(() => configureLlm(null));

describe("extractProtocolOntology", () => {
  it("fail-closed : sans clé LLM, renvoie des listes vides", async () => {
    configureLlm({
      hasLlmKey: () => false,
      modelFor: () => { throw new Error("ne doit pas être appelé"); },
      generateObjectFor: async () => { throw new Error("ne doit pas être appelé"); },
      generateProse: async () => { throw new Error("ne doit pas être appelé"); },
    });
    const out = await extractProtocolOntology(protocol);
    expect(out).toEqual({ parameterTypes: [], reagents: [], cellLines: [], failureModes: [] });
  });

  it("extrait params + réactifs + lignées + failuremodes (numériques et qualitatifs)", async () => {
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => ({}) as never,
      generateObjectFor: async () =>
        ({
          parameterTypes: [{ key: "trypsination_time", label: "Temps de trypsination", unit: "min", aliases: [] }],
          reagents: ["MitoTracker", "PFA 4%"],
          cellLines: ["HeLa"],
          failureModes: [
            { paramLabel: "Temps de trypsination", operator: "<", threshold: 3, unit: "min", verdict: "failure", mechanism: "cellules adhérentes" },
            { paramLabel: null, trigger: "PBS au lieu du milieu", verdict: "failure", mechanism: "stress cellulaire" },
          ],
        }) as never,
      generateProse: async () => "",
    });
    const out = await extractProtocolOntology(protocol);
    expect(out.reagents).toEqual(["mitotracker", "pfa_4"]);
    expect(out.cellLines).toEqual(["hela"]);
    expect(out.failureModes.length).toBe(2);
    const numeric = out.failureModes.find((f) => f.paramTypeKey === "trypsination_time");
    expect(numeric?.threshold).toBe(3);
    const qual = out.failureModes.find((f) => f.trigger === "PBS au lieu du milieu");
    expect(qual?.paramTypeKey).toBeUndefined();
    expect(qual?.mechanism).toBe("stress cellulaire");
  });
});

describe("extractOpenGraph (ontologie ouverte)", () => {
  afterEach(() => configureLlm(null));

  it("fail-closed : sans clé LLM, renvoie des listes vides", async () => {
    configureLlm({
      hasLlmKey: () => false,
      modelFor: () => { throw new Error("ne doit pas être appelé"); },
      generateObjectFor: async () => { throw new Error("ne doit pas être appelé"); },
      generateProse: async () => { throw new Error("ne doit pas être appelé"); },
    });
    expect(await extractOpenGraph("un texte", [], "report")).toEqual({ entities: [], triplets: [] });
  });

  it("renvoie les entités objectives + triplets produits par l'IA", async () => {
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => ({}) as never,
      generateObjectFor: async () =>
        ({
          entities: [
            { id: "e1", type: "run", label: "Run marquage", aliases: [], value: null, unit: null },
            { id: "e2", type: "instrument", label: "Confocal Zeiss", aliases: ["zeiss"], value: null, unit: null },
            { id: "e3", type: "operator", label: "Clément", aliases: [], value: null, unit: null },
          ],
          triplets: [
            { subject: "e1", relation: "performed_on", object: "e2" },
            { subject: "e1", relation: "performed_by", object: "e3" },
          ],
        }) as never,
      generateProse: async () => "",
    });
    const g = await extractOpenGraph("run réalisé au confocal Zeiss par Clément", [], "report");
    expect(g.entities.map((e) => e.type)).toEqual(["run", "instrument", "operator"]);
    expect(g.triplets).toHaveLength(2);
    expect(g.triplets[0].relation).toBe("performed_on");
  });
});

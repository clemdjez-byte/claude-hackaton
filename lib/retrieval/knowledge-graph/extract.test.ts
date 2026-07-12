// lib/live-experiment/features/knowledge-graph/extract.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { configureLlm } from "@/lib/core";
import { extractProtocolOntology } from "./extract";
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

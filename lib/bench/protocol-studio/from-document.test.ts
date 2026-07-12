import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb } from "@/lib/core/sqlite";
import { configureLlm } from "@/lib/core/llm";
import type { LlmProvider } from "@/lib/core/types";
import { generateProtocolFromDocument, getProtocol } from "./index";

// Le LLM est mocké : on ne teste pas Claude mais le câblage (tâche "protocol",
// document passé dans le prompt, brouillon persisté et relisible).
const FAKE_DRAFT = {
  title: "Extracted RT-qPCR",
  summary: "Extrait d'un document",
  materials: [],
  steps: [
    { index: 0, title: "Préparer le mix", instruction: "Mélanger les réactifs", critical: true },
    { index: 1, title: "Lancer la PCR", instruction: "Cycler" },
  ],
  parameters: [{ key: "n_reactions", label: "Réactions", default: 6, unit: "rxn" }],
  sources: [{ kind: "sop", ref: "protocole.pdf" }],
};

let lastCall: { task: string; system: string; prompt: string } | null = null;

const fakeLlm: LlmProvider = {
  hasLlmKey: () => true,
  modelFor: () => {
    throw new Error("modelFor non utilisé dans ce test");
  },
  async generateObjectFor(task, args) {
    lastCall = { task, system: args.system, prompt: args.prompt };
    return FAKE_DRAFT as unknown as never;
  },
  async generateProse() {
    return "";
  },
};

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  configureLlm(fakeLlm);
});

afterAll(() => {
  configureLlm(null);
});

describe("Protocol Studio — generateProtocolFromDocument", () => {
  it("extrait un protocole depuis un texte de document (brouillon sourcé)", async () => {
    const d = createDb(":memory:");
    const p = await generateProtocolFromDocument(
      d,
      "lab1",
      "Texte OCR long décrivant un protocole RT-qPCR..."
    );

    expect(p.title).toBe("Extracted RT-qPCR");
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
    expect(p.steps.length).toBe(2);
    expect(p.sources[0].ref).toBe("protocole.pdf");

    // Persistant et relisible
    const again = await getProtocol(d, p.id);
    expect(again?.title).toBe("Extracted RT-qPCR");

    // Câblage : tâche "protocol" et document injecté dans le prompt
    expect(lastCall?.task).toBe("protocol");
    expect(lastCall?.prompt).toContain("Texte OCR long");
    d.close();
  });
});

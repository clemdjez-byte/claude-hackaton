import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { type Db } from "../../core";
import { createDb } from "../../adapters.standalone";
import { configureLiveExperimentLlm } from "../../core/llm";
import type { LiveExperimentLlm } from "../../ports";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, getRunContext } from "../live-bench";
import { streamVoiceCommand } from "./index";

// Usage minimal au format spec v4 (inputTokens/outputTokens imbriqués).
const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 8, text: 8, reasoning: undefined },
} as const;

// Mock d'un modèle qui, au 1er appel, appelle l'outil next_step ; au 2e appel,
// génère du texte puis s'arrête. Un tableau = un résultat par appel successif.
function mockModel() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "tool-input-start", id: "call-1", toolName: "next_step" },
            { type: "tool-input-delta", id: "call-1", delta: "{}" },
            { type: "tool-input-end", id: "call-1" },
            { type: "tool-call", toolCallId: "call-1", toolName: "next_step", input: "{}" },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage: USAGE },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Étape suivante lancée." },
            { type: "text-end", id: "text-1" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
          ],
        }),
      },
    ],
  });
}

const fakeLlm: LiveExperimentLlm = {
  hasLlmKey: () => true,
  modelFor: () => mockModel(),
  async generateObjectFor() {
    throw new Error("generateObjectFor non utilisé dans ce test");
  },
  async generateProse() {
    return "";
  },
};

beforeAll(() => {
  process.env.FEATURE_VOICE_COPILOT = "true";
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_LAB_MEMORY = "true";
  configureLiveExperimentLlm(fakeLlm);
});

afterAll(() => {
  configureLiveExperimentLlm(null);
});

async function seededRun(d: Db) {
  const proto = await seedReferenceProtocol(d, "lab1");
  return startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params: { n_reactions: 24 } });
}

describe("streamVoiceCommand", () => {
  it("streame le texte de la réponse et exécute l'outil (le run avance)", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);

    const result = await streamVoiceCommand(d, "lab1", ctx.run.id, "u1", "étape suivante", "fr");

    // Consommer tout le flux (déclenche l'exécution des outils).
    let text = "";
    const toolNames: string[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") text += part.text;
      if (part.type === "tool-call") toolNames.push(part.toolName);
    }

    expect(text).toContain("Étape suivante lancée");
    expect(toolNames).toContain("next_step");

    // L'outil a réellement fait avancer le run (index 0 → 1).
    const rc = await getRunContext(d, ctx.run.id);
    expect(rc?.currentStep?.protocolStepIndex).toBe(1);
    d.close();
  });
});

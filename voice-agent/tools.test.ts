// voice-agent/tools.test.ts — l'adaptateur outils AI SDK → LiveKit est la seule
// pièce nouvelle avec de la logique : on la teste sans micro ni room.
import { describe, expect, it, vi, beforeAll } from "vitest";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "@/lib/bench/protocol-studio";
import { startRun } from "@/lib/bench/live-bench";
import { buildVoiceTools } from "@/lib/bench/voice-copilot";
import { buildAgentTools, buildExecute, type ToolDeps } from "./tools";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_VOICE_COPILOT = "true";
});

function deps(): ToolDeps & { sendClientEvent: ReturnType<typeof vi.fn>; onMutation: ReturnType<typeof vi.fn> } {
  return { sendClientEvent: vi.fn(async () => {}), onMutation: vi.fn(async () => {}) };
}

function fakeAiTool(result: unknown = "ok") {
  return { description: "d", inputSchema: undefined, execute: vi.fn(async () => result) };
}

describe("buildExecute — outils client (relayés au navigateur)", () => {
  it("start_timer envoie un event timer et n'exécute PAS l'outil serveur", async () => {
    const d = deps();
    const ai = fakeAiTool();
    const out = await buildExecute("start_timer", ai, d)({ label: "élution", seconds: 120 });
    expect(d.sendClientEvent).toHaveBeenCalledWith({ type: "timer", label: "élution", seconds: 120 });
    expect(ai.execute).not.toHaveBeenCalled();
    expect(d.onMutation).not.toHaveBeenCalled();
    expect(typeof out).toBe("string");
  });

  it("capture_photo et close_camera relaient l'event correspondant", async () => {
    for (const name of ["capture_photo", "close_camera"] as const) {
      const d = deps();
      await buildExecute(name, fakeAiTool(), d)({});
      expect(d.sendClientEvent).toHaveBeenCalledWith({ type: name });
    }
  });

  it("control_timer relaie un event timer_control (action + label) sans exécuter l'outil serveur", async () => {
    const d = deps();
    const ai = fakeAiTool();
    const out = await buildExecute("control_timer", ai, d)({ action: "pause", label: "hybridation" });
    expect(d.sendClientEvent).toHaveBeenCalledWith({ type: "timer_control", action: "pause", label: "hybridation" });
    expect(ai.execute).not.toHaveBeenCalled();
    expect(d.onMutation).not.toHaveBeenCalled();
    expect(typeof out).toBe("string");
  });
});

describe("buildExecute — outils serveur", () => {
  it("next_step délègue à l'outil AI SDK puis déclenche onMutation", async () => {
    const d = deps();
    const ai = fakeAiTool("étape suivante ok");
    const out = await buildExecute("next_step", ai, d)({});
    expect(ai.execute).toHaveBeenCalled();
    expect(d.onMutation).toHaveBeenCalledTimes(1);
    expect(out).toBe("étape suivante ok");
  });

  it("query_memory délègue SANS onMutation (lecture seule)", async () => {
    const d = deps();
    await buildExecute("query_memory", fakeAiTool(), d)({ query: "gel" });
    expect(d.onMutation).not.toHaveBeenCalled();
  });

  it("sérialise un résultat objet en JSON", async () => {
    const d = deps();
    const out = await buildExecute("add_note", fakeAiTool({ noted: true }), d)({ text: "x" });
    expect(out).toBe(JSON.stringify({ noted: true }));
    expect(d.onMutation).toHaveBeenCalled();
  });
});

describe("buildAgentTools — intégration avec les vrais outils du cœur", () => {
  it("mappe les 14 outils du copilote sur un run réel", async () => {
    const db = createDb(":memory:");
    const proto = await seedReferenceProtocol(db, "demo");
    const ctx = await startRun(db, "demo", { operator: "op", protocolId: proto.id });
    const aiTools = buildVoiceTools({ db, ws: "demo", runId: ctx.run.id, operator: "op" });
    expect(Object.keys(aiTools).sort()).toEqual([
      "add_note", "capture_photo", "close_camera", "control_timer", "delete_evidence", "flag_deviation",
      "list_evidence", "next_step", "query_memory", "read_step", "record_measurement",
      "skip_step", "start_timer", "step_back",
    ]);
    const mapped = buildAgentTools({ db, ws: "demo", runId: ctx.run.id, operator: "op" }, deps());
    expect(mapped).toHaveLength(14);
    db.close();
  });
});

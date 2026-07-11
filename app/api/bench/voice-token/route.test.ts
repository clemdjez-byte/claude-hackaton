// Tests de la route token : gardes (flag, runId, run existant) + forme du 200.
// La DB singleton du process de test est mise en mémoire AVANT tout import.
process.env.OCTOPUS_DB_PATH = ":memory:";

import { describe, expect, it, vi, afterEach, beforeAll } from "vitest";
import { getDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "@/lib/bench/protocol-studio";
import { startRun } from "@/lib/bench/live-bench";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/bench/voice-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/bench/voice-token", () => {
  it("403 si le flag voiceCopilot est désactivé (fail-closed)", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "false");
    const res = await POST(req({ runId: "x" }));
    expect(res.status).toBe(403);
  });

  it("400 sans runId", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("404 si le run n'existe pas", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const res = await POST(req({ runId: "run-inconnu" }));
    expect(res.status).toBe(404);
  });

  it("200 avec url, token JWT et room bench-run-<id> pour un run réel", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const db = getDb(); // même singleton :memory: que la route
    const proto = await seedReferenceProtocol(db, "demo");
    const ctx = await startRun(db, "demo", { operator: "bench-operator", protocolId: proto.id });
    const res = await POST(req({ runId: ctx.run.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toBe(`bench-run-${ctx.run.id}`);
    expect(body.url).toMatch(/^wss?:\/\//);
    expect(body.token.split(".")).toHaveLength(3); // un JWT a 3 segments
  });
});

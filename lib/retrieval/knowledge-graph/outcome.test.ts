// lib/live-experiment/features/knowledge-graph/outcome.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "@/lib/core";
import { saveOutcome, getOutcome } from "./outcome";

beforeEach(() => { process.env.FEATURE_KNOWLEDGE_GRAPH = "true"; });

describe("outcome", () => {
  it("enregistre puis relit un verdict", async () => {
    const db = createDb(":memory:");
    const o = await saveOutcome(db, {
      ws: "demo", runId: "r1", verdict: "success",
      metric: { value: 92, unit: "% viability" },
    });
    expect(o.verdict).toBe("success");
    expect((await getOutcome(db, "r1"))?.metric).toEqual({ value: 92, unit: "% viability" });
    db.close();
  });

  it("fail-closed : jette si le flag est éteint", async () => {
    process.env.FEATURE_KNOWLEDGE_GRAPH = "false";
    const db = createDb(":memory:");
    await expect(saveOutcome(db, { ws: "demo", runId: "r2", verdict: "failure" })).rejects.toThrow();
    db.close();
  });
});

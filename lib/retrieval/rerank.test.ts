import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rerank, rerankEnabled } from "./rerank";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe("rerankEnabled", () => {
  it("actif si clé présente et rerank non coupé", () => {
    process.env.VOYAGE_API_KEY = "k";
    delete process.env.VOYAGE_RERANK;
    expect(rerankEnabled()).toBe(true);
  });
  it("inactif sans clé", () => {
    delete process.env.VOYAGE_API_KEY;
    expect(rerankEnabled()).toBe(false);
  });
  it("inactif si VOYAGE_RERANK=false", () => {
    process.env.VOYAGE_API_KEY = "k";
    process.env.VOYAGE_RERANK = "false";
    expect(rerankEnabled()).toBe(false);
  });
});

describe("rerank", () => {
  beforeEach(() => {
    process.env.VOYAGE_API_KEY = "k";
  });

  it("mappe index → score depuis la réponse Voyage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { index: 2, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.4 },
          ],
        }),
      }))
    );
    const ranked = await rerank("q", ["d0", "d1", "d2"], 3);
    expect(ranked).toEqual([
      { index: 2, score: 0.9 },
      { index: 0, score: 0.4 },
    ]);
  });

  it("lève sur réponse non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(rerank("q", ["d"], 1)).rejects.toThrow(/rerank/);
  });
});

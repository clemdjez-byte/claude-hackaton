import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { embed, embedBatch, cosine, activeEmbedding } from "./embed";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("embed (Voyage)", () => {
  it("fail-closed : sans VOYAGE_API_KEY, embed lève une erreur claire", async () => {
    delete process.env.VOYAGE_API_KEY;
    await expect(embed("bonjour")).rejects.toThrow(/VOYAGE_API_KEY/);
  });

  it("activeEmbedding reflète le modèle/dim configurés", () => {
    process.env.VOYAGE_MODEL = "voyage-3.5";
    process.env.VOYAGE_EMBED_DIM = "512";
    expect(activeEmbedding()).toEqual({ model: "voyage-3.5", dim: 512 });
  });

  it("embedBatch fait UN seul appel pour N textes et envoie le bon payload", async () => {
    process.env.VOYAGE_API_KEY = "k";
    process.env.VOYAGE_MODEL = "voyage-3.5";
    process.env.VOYAGE_EMBED_DIM = "1024";
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      // réponse volontairement dans le DÉSORDRE pour vérifier le tri par index
      return {
        ok: true,
        json: async () => ({
          data: [
            { embedding: [2], index: 1 },
            { embedding: [1], index: 0 },
          ],
          _received: body,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const vectors = await embedBatch(["a", "b"], "document");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain("/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer k");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ model: "voyage-3.5", input: ["a", "b"], input_type: "document", output_dimension: 1024 });
    // trié par index → [1] puis [2]
    expect(vectors).toEqual([[1], [2]]);
  });

  it("retry une fois sur 429 puis réussit", async () => {
    process.env.VOYAGE_API_KEY = "k";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 429, text: async () => "rate" };
        return { ok: true, json: async () => ({ data: [{ embedding: [0.5], index: 0 }] }) };
      })
    );
    const v = await embed("x");
    expect(calls).toBe(2);
    expect(v).toEqual([0.5]);
  });

  it("cosine = produit scalaire (vecteurs normalisés)", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

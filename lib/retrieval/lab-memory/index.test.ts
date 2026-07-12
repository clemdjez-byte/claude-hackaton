import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import { indexEntry, search, recall } from "./index";

// Mock déterministe de l'API Voyage : reproduit un embedding « sac-de-mots »
// (dim 256) — même sémantique de recouvrement lexical que l'ancien embedder
// local, pour que les assertions d'ordre/pertinence tiennent SANS réseau.
const DIM = 256;
function bow(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

beforeAll(() => {
  process.env.FEATURE_LAB_MEMORY = "true";
  process.env.VOYAGE_API_KEY = "test-key";
  process.env.VOYAGE_EMBED_DIM = String(DIM);
  process.env.VOYAGE_RERANK = "false"; // pas de 2e étage dans les tests
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { input } = JSON.parse(init.body) as { input: string[] };
      return {
        ok: true,
        json: async () => ({
          data: input.map((t, index) => ({ embedding: bow(t), index })),
        }),
      };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function db(): Db {
  return createDb(":memory:");
}

// Sème quatre souvenirs à vocabulaire distinct dans le même lab.
async function semer(d: Db): Promise<void> {
  await indexEntry(d, {
    ws: "lab1",
    sourceType: "run",
    sourceId: "run_a",
    text: "incubation prolongee 12 min sur la ligase",
    meta: { titre: "Ligature nocturne" },
  });
  await indexEntry(d, {
    ws: "lab1",
    sourceType: "run",
    sourceId: "run_b",
    text: "hybridation 55 degres deviation de temperature",
  });
  await indexEntry(d, {
    ws: "lab1",
    sourceType: "evidence",
    sourceId: "ev_c",
    text: "NTC oublie contamination possible du controle negatif",
  });
  await indexEntry(d, {
    ws: "lab1",
    sourceType: "protocol",
    sourceId: "pg_d",
    text: "incubation courte gel migration des bandes",
  });
}

describe("Lab Memory", () => {
  it("indexEntry crée une (ou des) entrée(s) mémoire vectorisée(s)", async () => {
    const d = db();
    const [entry] = await indexEntry(d, {
      ws: "lab1",
      sourceType: "report",
      sourceId: "rp_1",
      text: "synthese du run qPCR",
      meta: { author: "operator" },
    });
    expect(entry.id).toMatch(/^mem_/);
    expect(entry.sourceType).toBe("report");
    expect(entry.sourceId).toBe("rp_1");
    expect(entry.meta).toEqual({ author: "operator" }); // texte court → 1 chunk, meta inchangée
    d.close();
  });

  it("search remonte l'entrée la plus pertinente en tête", async () => {
    const d = db();
    await semer(d);
    const hits = await search(d, "lab1", "incubation prolongee");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sourceId).toBe("run_a"); // partage « incubation » ET « prolongee »
    expect(hits[0].score).toBeGreaterThan(0);
    // les scores sont triés par pertinence décroissante
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
    d.close();
  });

  it("search écarte les entrées sans aucun mot en commun", async () => {
    const d = db();
    await semer(d);
    const hits = await search(d, "lab1", "incubation");
    // Seules les deux entrées contenant « incubation » remontent.
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.sourceId).sort()).toEqual(["pg_d", "run_a"]);
    d.close();
  });

  it("k limite le nombre de résultats", async () => {
    const d = db();
    await semer(d);
    const complet = await search(d, "lab1", "incubation"); // les deux « incubation »
    expect(complet.length).toBe(2);
    const limite = await search(d, "lab1", "incubation", 1);
    expect(limite.length).toBe(1);
    expect(limite[0].sourceId).toBe(complet[0].sourceId); // garde bien le meilleur
    d.close();
  });

  it("search est cloisonné par workspace", async () => {
    const d = db();
    await semer(d);
    const hits = await search(d, "lab2", "incubation");
    expect(hits).toEqual([]);
    d.close();
  });

  it("recall est un alias sémantique de search", async () => {
    const d = db();
    await semer(d);
    const parRecall = await recall(d, "lab1", "hybridation temperature");
    const parSearch = await search(d, "lab1", "hybridation temperature");
    expect(parRecall).toEqual(parSearch);
    expect(parRecall[0].sourceId).toBe("run_b");
    d.close();
  });

  it("respecte le flag (désactivé → throw)", async () => {
    const d = db();
    process.env.FEATURE_LAB_MEMORY = "";
    await expect(
      indexEntry(d, { ws: "lab1", sourceType: "run", sourceId: "x", text: "test" })
    ).rejects.toThrow();
    await expect(search(d, "lab1", "test")).rejects.toThrow();
    await expect(recall(d, "lab1", "test")).rejects.toThrow();
    process.env.FEATURE_LAB_MEMORY = "true";
    d.close();
  });
});

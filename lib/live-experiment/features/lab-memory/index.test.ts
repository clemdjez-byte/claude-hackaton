import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "../../core";
import { createDb } from "../../adapters.standalone";
import { indexEntry, search, recall } from "./index";

beforeAll(() => {
  process.env.FEATURE_LAB_MEMORY = "true";
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
  it("indexEntry crée une entrée mémoire vectorisée", async () => {
    const d = db();
    const entry = await indexEntry(d, {
      ws: "lab1",
      sourceType: "report",
      sourceId: "rp_1",
      text: "synthese du run qPCR",
      meta: { auteur: "Sophie" },
    });
    expect(entry.id).toMatch(/^mem_/);
    expect(entry.sourceType).toBe("report");
    expect(entry.sourceId).toBe("rp_1");
    expect(entry.meta).toEqual({ auteur: "Sophie" });
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

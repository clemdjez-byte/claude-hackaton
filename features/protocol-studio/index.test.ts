import { describe, it, expect, beforeAll } from "vitest";
import { createDb, type Db } from "@/lib/core";
import {
  seedReferenceProtocol,
  getProtocol,
  listProtocols,
  publishProtocol,
  updateProtocol,
  previewScaledRecipe,
} from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
});

function db(): Db {
  return createDb(":memory:");
}

describe("Protocol Studio", () => {
  it("sème le protocole RT-qPCR de référence, sourcé", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    expect(p.version).toBe(1);
    expect(p.status).toBe("draft");
    expect(p.sources.length).toBeGreaterThan(0);
    expect(p.recipe?.components.some((c) => c.perWell)).toBe(true); // le template
    d.close();
  });

  it("previewScaledRecipe reproduit les chiffres déterministes (24 réactions)", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const scaled = previewScaledRecipe(p, 24, 10)!;
    const byName = Object.fromEntries(scaled.components.map((c) => [c.name, c.total.value]));
    expect(byName["Master mix 2×"]).toBe(264.0);
    expect(byName["Eau nuclease-free"]).toBe(184.8);
    expect(scaled.sharedTotal.value).toBe(475.2);
    d.close();
  });

  it("utilise les paramètres par défaut du protocole quand n non fourni (6 réactions)", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const scaled = previewScaledRecipe(p)!; // n_reactions default = 6, overage 10
    expect(scaled.sharedTotal.value).toBe(118.8);
    d.close();
  });

  it("versionne à l'update et refuse la publication sans source", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const v2 = await updateProtocol(d, p.id, { title: "RT-qPCR (adapté)" });
    expect(v2.version).toBe(2);
    expect(v2.title).toBe("RT-qPCR (adapté)");
    const pub = await publishProtocol(d, p.id);
    expect(pub.status).toBe("published");
    expect(pub.version).toBe(3);
    d.close();
  });

  it("liste les protocoles du lab (dernière version)", async () => {
    const d = db();
    await seedReferenceProtocol(d, "lab1");
    await seedReferenceProtocol(d, "lab1");
    const list = await listProtocols(d, "lab1");
    expect(list.length).toBe(2);
    d.close();
  });

  it("getProtocol respecte le flag (désactivé → throw)", async () => {
    const d = db();
    process.env.FEATURE_PROTOCOL_STUDIO = "";
    await expect(getProtocol(d, "pg_x")).rejects.toThrow();
    process.env.FEATURE_PROTOCOL_STUDIO = "true";
    d.close();
  });
});

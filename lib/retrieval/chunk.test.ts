import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("un texte court reste un seul chunk", () => {
    const chunks = chunkText("  incubation 12 min  ");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ text: "incubation 12 min", index: 0, count: 1 });
  });

  it("un texte long est découpé en plusieurs chunks cohérents", () => {
    const para = "a".repeat(400);
    const long = Array.from({ length: 6 }, () => para).join("\n\n"); // ~2400 car.
    const chunks = chunkText(long, { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // index croissants à partir de 0
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    // count identique et égal au nombre de chunks
    expect(chunks.every((c) => c.count === chunks.length)).toBe(true);
    // chaque chunk respecte la borne de taille
    expect(chunks.every((c) => c.text.length <= 1000)).toBe(true);
    // aucun contenu vide
    expect(chunks.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it("un paragraphe unique trop long est coupé avec chevauchement", () => {
    const chunks = chunkText("x".repeat(2500), { size: 1000, overlap: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    // le pas est size - overlap = 800 → chunks à 0, 800, 1600, 2400
    expect(chunks[0].text.length).toBe(1000);
  });
});

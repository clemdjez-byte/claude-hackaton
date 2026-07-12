import { describe, it, expect } from "vitest";
import { localEmbed, LOCAL_EMBED_DIM } from "./local-embed";

describe("localEmbed", () => {
  it("déterministe et de dimension fixe", () => {
    const a = localEmbed("mitochondrial staining");
    const b = localEmbed("mitochondrial staining");
    expect(a).toHaveLength(LOCAL_EMBED_DIM);
    expect(a).toEqual(b);
  });

  it("normalisé L2 (norme ≈ 1), et vecteur nul pour un texte sans token", () => {
    const v = localEmbed("cell culture expansion");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
    expect(localEmbed("   !! ")).toEqual(new Array(LOCAL_EMBED_DIM).fill(0));
  });

  it("des textes proches partagent plus de dimensions que des textes distants", () => {
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const near = cos(localEmbed("cell culture medium"), localEmbed("cell culture flask"));
    const far = cos(localEmbed("cell culture medium"), localEmbed("western blot antibody"));
    expect(near).toBeGreaterThan(far);
  });
});

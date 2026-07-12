import { describe, it, expect } from "vitest";
import { projectTo3D } from "./project3d";
import { localEmbed as embed } from "./local-embed";

const TEXTS = [
  "mitochondrial staining protocol with mitotracker",
  "mitochondrial membrane potential assay jc-1",
  "cell expansion passage confluency trypsin",
  "cell culture expansion medium fbs",
  "western blot protein transfer membrane",
  "pcr amplification primer annealing",
];
const vecs = TEXTS.map((t) => embed(t));

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("projectTo3D", () => {
  it("liste vide → liste vide", () => {
    expect(projectTo3D([])).toEqual([]);
  });

  it("un seul vecteur → origine", () => {
    expect(projectTo3D([embed("solo")])).toEqual([[0, 0, 0]]);
  });

  it("deux vecteurs distincts → deux points séparés, coords finies", () => {
    const out = projectTo3D([embed("alpha beta gamma"), embed("delta epsilon zeta")]);
    expect(out).toHaveLength(2);
    for (const p of out) for (const c of p) expect(Number.isFinite(c)).toBe(true);
    expect(dist(out[0], out[1])).toBeGreaterThan(0);
  });

  it("coords finies et bornées dans [-1, 1], le cube est rempli (max ≈ 1)", () => {
    const out = projectTo3D(vecs);
    expect(out).toHaveLength(vecs.length);
    let maxAbs = 0;
    for (const p of out) {
      for (const c of p) {
        expect(Number.isFinite(c)).toBe(true);
        expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-9);
        maxAbs = Math.max(maxAbs, Math.abs(c));
      }
    }
    expect(maxAbs).toBeGreaterThan(0.99);
  });

  it("déterministe : deux appels identiques → sorties strictement égales", () => {
    expect(projectTo3D(vecs)).toEqual(projectTo3D(vecs));
  });

  it("indépendant de l'ordre : les distances par paires sont préservées sous permutation", () => {
    const perm = [4, 1, 5, 0, 3, 2]; // permutation des indices
    const base = projectTo3D(vecs);
    const shuffled = projectTo3D(perm.map((i) => vecs[i]));
    // shuffled[a] correspond au vecteur original perm[a]
    for (let a = 0; a < perm.length; a++) {
      for (let b = a + 1; b < perm.length; b++) {
        const dBase = dist(base[perm[a]], base[perm[b]]);
        const dShuf = dist(shuffled[a], shuffled[b]);
        expect(Math.abs(dBase - dShuf)).toBeLessThan(1e-6);
      }
    }
  });

  it("vecteurs tous identiques → tous à l'origine (pas de NaN)", () => {
    const same = embed("identique");
    const out = projectTo3D([same, same, same, same]);
    for (const p of out) expect(p).toEqual([0, 0, 0]);
  });
});

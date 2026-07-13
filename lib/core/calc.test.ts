import { describe, it, expect } from "vitest";
import { scaleMasterMix, convert, dilution, round, molarity, describe as describeStats } from "./calc";
import type { Recipe } from "./types";

// Recette RT-qPCR de référence (SYBR Green PowerUp, réaction 20 µL).
// Le template cDNA est ajouté PAR PUITS → perWell (exclu de l'excès partagé).
const RT_QPCR: Recipe = {
  name: "qPCR master mix (SYBR Green, 20 µL)",
  finalVolumePerReaction: { value: 20, unit: "µL" },
  components: [
    { name: "Master mix 2×", perReaction: { value: 10, unit: "µL" } },
    { name: "Amorce F (10 µM)", perReaction: { value: 0.5, unit: "µL" } },
    { name: "Amorce R (10 µM)", perReaction: { value: 0.5, unit: "µL" } },
    { name: "Eau nuclease-free", perReaction: { value: 7, unit: "µL" } },
    { name: "Template cDNA", perReaction: { value: 2, unit: "µL" }, perWell: true },
  ],
};

describe("scaleMasterMix — le beat héros de la démo (6 → 24, excès +10 %)", () => {
  const r = scaleMasterMix(RT_QPCR, 24, 10);

  it("facteur effectif = 24 × 1,1 = 26,4", () => {
    expect(r.effectiveFactor).toBe(26.4);
  });

  it("recalcule chaque composant partagé au µL près", () => {
    const byName = Object.fromEntries(r.components.map((c) => [c.name, c.total.value]));
    expect(byName["Master mix 2×"]).toBe(264.0);
    expect(byName["Amorce F (10 µM)"]).toBe(13.2);
    expect(byName["Amorce R (10 µM)"]).toBe(13.2);
    expect(byName["Eau nuclease-free"]).toBe(184.8);
  });

  it("le template (perWell) est sans excès : 2 × 24 = 48 µL", () => {
    const template = r.components.find((c) => c.name === "Template cDNA")!;
    expect(template.shared).toBe(false);
    expect(template.total.value).toBe(48.0);
  });

  it("total du mix partagé = 475,2 µL (vérif croisée : somme = 18 × 26,4)", () => {
    expect(r.sharedTotal.value).toBe(475.2);
    expect(264.0 + 13.2 + 13.2 + 184.8).toBe(475.2);
    expect(round(18 * 26.4, 3)).toBe(475.2);
  });

  it("réserve morte = 475,2 − (18 × 24) = 43,2 µL = 432 × 0,10", () => {
    expect(r.deadVolume.value).toBe(43.2);
    expect(round(432 * 0.1, 3)).toBe(43.2);
  });
});

describe("scaleMasterMix — cohérence 6 → 24", () => {
  it("chaque composant partagé est ×4 entre 6 et 24 réactions", () => {
    const six = scaleMasterMix(RT_QPCR, 6, 10);
    const twentyFour = scaleMasterMix(RT_QPCR, 24, 10);
    expect(six.sharedTotal.value).toBe(118.8);
    expect(round(twentyFour.sharedTotal.value / six.sharedTotal.value, 3)).toBe(4);
  });

  it("rejette les entrées invalides", () => {
    expect(() => scaleMasterMix(RT_QPCR, 0, 10)).toThrow();
    expect(() => scaleMasterMix(RT_QPCR, 6.5, 10)).toThrow();
    expect(() => scaleMasterMix(RT_QPCR, 6, -5)).toThrow();
  });
});

describe("convert", () => {
  it("convertit µL ↔ mL", () => {
    expect(convert({ value: 475.2, unit: "µL" }, "mL").value).toBe(0.4752);
    expect(convert({ value: 1, unit: "mL" }, "µL").value).toBe(1000);
  });
  it("refuse les dimensions incompatibles", () => {
    expect(() => convert({ value: 1, unit: "µL" }, "mg")).toThrow();
  });
});

describe("dilution C1·V1 = C2·V2", () => {
  it("dilue une amorce 100 µM → 10 µM dans 100 µL", () => {
    const d = dilution({ value: 100, unit: "µM" }, { value: 10, unit: "µM" }, { value: 100, unit: "µL" });
    expect(d.stockVolume.value).toBe(10);
    expect(d.diluentVolume.value).toBe(90);
    expect(d.foldDilution).toBe(10);
  });
  it("refuse une concentration finale supérieure à la mère", () => {
    expect(() =>
      dilution({ value: 10, unit: "µM" }, { value: 100, unit: "µM" }, { value: 100, unit: "µL" })
    ).toThrow();
  });
});

describe("molarity m = C·V·MW", () => {
  it("masse pour un stock (quizartinib MW 560,5 → 1 mL à 10 mM)", () => {
    const r = molarity({ molarMass: 560.5, solve: "mass", concentration: { value: 10, unit: "mM" }, volume: { value: 1, unit: "mL" } });
    expect(r.unit).toBe("mg");
    expect(r.value).toBe(5.605);
  });
  it("concentration depuis une masse pesée (5,605 mg dans 1 mL)", () => {
    const r = molarity({ molarMass: 560.5, solve: "concentration", mass: { value: 5.605, unit: "mg" }, volume: { value: 1, unit: "mL" } });
    expect(r.unit).toBe("mM");
    expect(r.value).toBe(10);
  });
  it("rejette une entrée incomplète", () => {
    expect(() => molarity({ molarMass: 560.5, solve: "mass", volume: { value: 1, unit: "mL" } })).toThrow();
  });
});

describe("describe — stats descriptives déterministes", () => {
  it("n, moyenne, médiane, écart-type échantillon", () => {
    const s = describeStats([2, 4, 4, 4, 5, 5, 7, 9])!;
    expect(s.n).toBe(8);
    expect(s.mean).toBe(5);
    expect(s.median).toBe(4.5);
    expect(s.sd).toBe(2.1381); // écart-type d'échantillon (n-1)
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
  });
  it("renvoie null si aucune valeur finie", () => {
    expect(describeStats([])).toBeNull();
    expect(describeStats([NaN, Infinity])).toBeNull();
  });
});

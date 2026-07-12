// lib/live-experiment/features/knowledge-graph/ontology.test.ts
import { describe, it, expect } from "vitest";
import {
  NODE,
  REL,
  PARAMETER_TYPES,
  normalizeParamKey,
  violatesThreshold,
  reagentKey,
  cellLineKey,
} from "./ontology";

describe("ontology", () => {
  it("construit des nœuds typés", () => {
    expect(NODE.run("r1")).toEqual({ type: "run", id: "r1" });
    expect(NODE.parameterType("cell_density")).toEqual({
      type: "parameter_type",
      id: "cell_density",
    });
  });

  it("expose des relations stables", () => {
    expect(REL.attributedTo).toBe("attributed_to");
    expect(REL.hasValue).toBe("has_value");
  });

  it("normalise un libellé brut vers une clé canonique", () => {
    expect(normalizeParamKey("cell_density")).toBe("cell_density");
    expect(normalizeParamKey("Densité cellulaire")).toBe("cell_density");
    expect(normalizeParamKey("concentration cellulaire")).toBe("cell_density");
    expect(normalizeParamKey("Temps de trypsination")).toBe("trypsination_time");
    expect(normalizeParamKey("param inconnu")).toBeNull();
  });

  it("chaque ParameterType a une clé unique et une unité", () => {
    const keys = PARAMETER_TYPES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PARAMETER_TYPES) expect(p.unit).toBeTruthy();
  });

  it("détecte la violation d'un seuil selon l'opérateur", () => {
    expect(violatesThreshold("<", 3, 2)).toBe(true); // trypsination 2 < 3 → danger
    expect(violatesThreshold("<", 3, 3)).toBe(false); // au seuil → OK
    expect(violatesThreshold("<", 3, 4)).toBe(false);
    expect(violatesThreshold(">", 10, 15)).toBe(true); // PFA 15 > 10 → danger
    expect(violatesThreshold(">", 10, 10)).toBe(false);
    expect(violatesThreshold("=", 7, 5)).toBe(true); // valeur attendue = 7, observée 5 → écart
    expect(violatesThreshold("=", 7, 7)).toBe(false);
  });

  it("slugifie réactifs et lignées en clés canoniques", () => {
    expect(reagentKey("MitoTracker")).toBe("mitotracker");
    expect(reagentKey("PFA 4%")).toBe("pfa_4");
    expect(cellLineKey("HeLa")).toBe("hela");
    expect(cellLineKey("Éosine-3")).toBe("eosine_3");
  });
});

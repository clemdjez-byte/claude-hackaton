import { describe, it, expect } from "vitest";
import { docToSteps, stepsToDoc, PROTOCOL_STEP_NODE } from "./doc";
import type { ProtocolStep } from "../../core/types";

const STEPS: ProtocolStep[] = [
  { index: 0, title: "Préparer le master mix", instruction: "Combiner les composants partagés.", critical: true },
  { index: 1, title: "Distribuer 18 µL", instruction: "Répartir dans chaque puits.", durationSec: 300 },
  { index: 2, title: "Programme qPCR", instruction: "40 cycles.", temperature: { value: 95, unit: "°C" } },
];

describe("stepsToDoc / docToSteps", () => {
  it("round-trip : stepsToDoc puis docToSteps rend les étapes identiques", () => {
    expect(docToSteps(stepsToDoc(STEPS))).toEqual(STEPS);
  });

  it("réindexe index de 0..n-1 dans l'ordre du document", () => {
    const doc = {
      type: "doc",
      content: [
        { type: PROTOCOL_STEP_NODE, attrs: { index: 7, title: "A", critical: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
        { type: PROTOCOL_STEP_NODE, attrs: { index: 3, title: "B", critical: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "y" }] }] },
      ],
    };
    expect(docToSteps(doc).map((s) => s.index)).toEqual([0, 1]);
  });

  it("ignore la prose libre (heading / paragraphe hors node étape)", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Contexte" }] },
        { type: "paragraph", content: [{ type: "text", text: "blabla" }] },
        { type: PROTOCOL_STEP_NODE, attrs: { index: 0, title: "Étape", critical: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "faire ça" }] }] },
      ],
    };
    const steps = docToSteps(doc);
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("Étape");
    expect(steps[0].instruction).toBe("faire ça");
  });

  it("jette une erreur claire si une durée n'est pas un entier de secondes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: PROTOCOL_STEP_NODE, attrs: { index: 0, title: "X", durationSec: 1.5, critical: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "z" }] }] },
      ],
    };
    expect(() => docToSteps(doc)).toThrow(/Étape 1/);
  });

  it("jette si une étape n'a pas de titre", () => {
    const doc = {
      type: "doc",
      content: [
        { type: PROTOCOL_STEP_NODE, attrs: { index: 0, title: "  ", critical: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "z" }] }] },
      ],
    };
    expect(() => docToSteps(doc)).toThrow(/titre/i);
  });
});

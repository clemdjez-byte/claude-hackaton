import { describe, it, expect } from "vitest";
import { tokenizeCitations, numberCitations, citeKey } from "./citations";

describe("tokenizeCitations", () => {
  it("texte sans citation → un seul token texte", () => {
    expect(tokenizeCitations("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
  });
  it("extrait [type:id]", () => {
    expect(tokenizeCitations("a [run:run_1] b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "cite", sourceType: "run", sourceId: "run_1" },
      { kind: "text", text: " b" },
    ]);
  });
  it("extrait la forme courte (ev_xxx) comme evidence", () => {
    expect(tokenizeCitations("x (ev_abc123) y")).toEqual([
      { kind: "text", text: "x " },
      { kind: "cite", sourceType: "evidence", sourceId: "ev_abc123" },
      { kind: "text", text: " y" },
    ]);
  });
  it("tag incomplet (streaming) reste du texte", () => {
    expect(tokenizeCitations("partial [run:run_")).toEqual([{ kind: "text", text: "partial [run:run_" }]);
  });
});

describe("numberCitations", () => {
  it("numérote par ordre d'apparition, déduplique", () => {
    const { refs, keyToN } = numberCitations("[run:a] then [report:b] then [run:a] again");
    expect(refs).toEqual([
      { n: 1, sourceType: "run", sourceId: "a" },
      { n: 2, sourceType: "report", sourceId: "b" },
    ]);
    expect(keyToN.get(citeKey("run", "a"))).toBe(1);
    expect(keyToN.get(citeKey("report", "b"))).toBe(2);
  });
  it("texte sans citation → aucune ref", () => {
    expect(numberCitations("nothing here").refs).toEqual([]);
  });
});

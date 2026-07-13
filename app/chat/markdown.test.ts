import { describe, it, expect } from "vitest";
import { parseEmphasis, parseInline, parseMarkdown } from "./markdown";

describe("parseEmphasis", () => {
  it("texte simple", () => {
    expect(parseEmphasis("plain")).toEqual([{ t: "text", text: "plain" }]);
  });
  it("gras", () => {
    expect(parseEmphasis("a **b** c")).toEqual([
      { t: "text", text: "a " },
      { t: "bold", text: "b" },
      { t: "text", text: " c" },
    ]);
  });
  it("italique * et _", () => {
    expect(parseEmphasis("*x* and _y_")).toEqual([
      { t: "italic", text: "x" },
      { t: "text", text: " and " },
      { t: "italic", text: "y" },
    ]);
  });
  it("gras non fermé → texte brut", () => {
    expect(parseEmphasis("a **b")).toEqual([{ t: "text", text: "a **b" }]);
  });
  it("gras multiple : non-greedy ne fusionne pas deux gras", () => {
    expect(parseEmphasis("**a** and **b**")).toEqual([
      { t: "bold", text: "a" },
      { t: "text", text: " and " },
      { t: "bold", text: "b" },
    ]);
  });
  it("étoile simple à l'intérieur d'un gras : capturée littéralement, pas de ** qui fuit", () => {
    expect(parseEmphasis("**bold *x* text**")).toEqual([
      { t: "bold", text: "bold *x* text" },
    ]);
  });
});

describe("parseInline", () => {
  it("mêle gras et citation", () => {
    const keyToN = new Map([["run:r1", 1]]);
    expect(parseInline("**MV4-11** [run:r1]", keyToN)).toEqual([
      { t: "bold", text: "MV4-11" },
      { t: "text", text: " " },
      { t: "cite", n: 1, sourceType: "run", sourceId: "r1" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("titre + liste + paragraphe", () => {
    const md = "## Section\n- item one\n- item two\n\nA paragraph.";
    expect(parseMarkdown(md, new Map())).toEqual([
      { type: "heading", level: 3, spans: [{ t: "text", text: "Section" }] },
      { type: "list", items: [
        [{ t: "text", text: "item one" }],
        [{ t: "text", text: "item two" }],
      ] },
      { type: "paragraph", lines: [[{ t: "text", text: "A paragraph." }]] },
    ]);
  });
  it("chaîne vide → aucun bloc", () => {
    expect(parseMarkdown("", new Map())).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { deriveSourceLabel, fallbackLabel } from "./sourceLabel";

describe("deriveSourceLabel", () => {
  it("première ligne non vide, sans marques markdown", () => {
    expect(deriveSourceLabel("# MV4-11 dose-response\n\nbody...")).toBe("MV4-11 dose-response");
  });
  it("nettoie le gras", () => {
    expect(deriveSourceLabel("**Quizartinib** run summary")).toBe("Quizartinib run summary");
  });
  it("tronque au-delà de la limite", () => {
    expect(deriveSourceLabel("x".repeat(80), 10)).toBe("xxxxxxxxx…");
  });
});

describe("fallbackLabel", () => {
  it("capitalise le type et raccourcit l'id", () => {
    expect(fallbackLabel("run", "run_dbc89423b1")).toBe("Run · run_dbc894");
  });
});

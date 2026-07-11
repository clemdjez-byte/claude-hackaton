import { describe, it, expect, afterEach } from "vitest";
import { isEnabled, assertEnabled, FeatureDisabledError } from "./flags";

const KEY = "FEATURE_LIVE_BENCH";
afterEach(() => {
  delete process.env[KEY];
});

describe("flags — fail-closed", () => {
  it("active UNIQUEMENT sur la valeur exacte 'true'", () => {
    process.env[KEY] = "true";
    expect(isEnabled("liveBench")).toBe(true);
  });

  it("reste OFF pour toute autre valeur (absent, vide, 'TRUE', '1', 'yes')", () => {
    for (const v of [undefined, "", "TRUE", "True", "1", "yes", "on", " true "]) {
      if (v === undefined) delete process.env[KEY];
      else process.env[KEY] = v;
      expect(isEnabled("liveBench")).toBe(false);
    }
  });

  it("assertEnabled lève FeatureDisabledError quand OFF", () => {
    delete process.env[KEY];
    expect(() => assertEnabled("liveBench")).toThrow(FeatureDisabledError);
  });

  it("assertEnabled passe quand ON", () => {
    process.env[KEY] = "true";
    expect(() => assertEnabled("liveBench")).not.toThrow();
  });
});

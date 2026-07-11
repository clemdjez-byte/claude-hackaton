import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "../../core";
import { createDb } from "../../adapters.standalone";
import { seedReferenceProtocol } from "../protocol-studio";
import {
  startRun,
  advanceStep,
  completeRun,
  getRunContext,
  getRunState,
} from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
});

async function seededRun(d: Db, params?: Record<string, number>) {
  const proto = await seedReferenceProtocol(d, "lab1");
  return startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params });
}

describe("Live Bench Mode", () => {
  it("startRun fige la version et écrit le master mix scalé (24 réactions) dans le step concerné", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d, { n_reactions: 24, overage_pct: 10 });
    expect(ctx.run.protocolVersion).toBe(1);
    expect(ctx.run.scalingContext.n_reactions).toBe(24);
    expect(ctx.scaledRecipe?.sharedTotal.value).toBe(475.2);

    const mmStep = ctx.steps.find((s) => /master mix qpcr/i.test(s.title))!;
    expect(mmStep.resolvedParams?.["Master mix 2×"]).toEqual({ value: 264, unit: "µL" });
    expect(mmStep.resolvedParams?.["Total mix partagé"]).toEqual({ value: 475.2, unit: "µL" });
    d.close();
  });

  it("startRun sans params utilise les défauts du protocole (6 réactions)", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    expect(ctx.run.scalingContext.n_reactions).toBe(6);
    expect(ctx.scaledRecipe?.sharedTotal.value).toBe(118.8);
    expect(ctx.currentStep?.status).toBe("active");
    d.close();
  });

  it("advanceStep clôt le step actif et active le suivant", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const first = ctx.steps[0];
    const { justCompleted, active } = await advanceStep(d, ctx.run.id);
    expect(justCompleted?.id).toBe(first.id);
    expect(justCompleted?.status).toBe("done");
    expect(active?.protocolStepIndex).toBe(1);
    expect(active?.status).toBe("active");
    d.close();
  });

  it("completeRun clôt le run avec endedAt", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const done = await completeRun(d, ctx.run.id);
    expect(done.status).toBe("completed");
    expect(done.endedAt).toBeTruthy();
    d.close();
  });

  it("getRunContext recompose protocole figé + scaling", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d, { n_reactions: 24 });
    const again = await getRunContext(d, ctx.run.id);
    expect(again?.scaledRecipe?.sharedTotal.value).toBe(475.2);
    expect(again?.protocol.version).toBe(1);
    d.close();
  });

  it("respecte le flag liveBench", async () => {
    const d = createDb(":memory:");
    process.env.FEATURE_LIVE_BENCH = "";
    await expect(getRunState(d, "run_x")).rejects.toThrow();
    process.env.FEATURE_LIVE_BENCH = "true";
    d.close();
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { createDb } from "../../adapters.standalone";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, advanceStep, completeRun, listRunsOverview, stepBack } from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
});

describe("Live Bench — listRunsOverview (tableau de bord)", () => {
  it("liste les runs avec titre du protocole et progression", async () => {
    const d = createDb(":memory:");
    const p = await seedReferenceProtocol(d, "lab1");

    const r1 = await startRun(d, "lab1", {
      operator: "op1",
      protocolId: p.id,
      params: { n_reactions: 24 },
    });
    await advanceStep(d, r1.run.id); // 1 étape terminée
    await startRun(d, "lab1", { operator: "op1", protocolId: p.id });

    const overviews = await listRunsOverview(d, "lab1");
    expect(overviews.length).toBe(2);
    expect(overviews.every((o) => o.protocolTitle === p.title)).toBe(true);
    expect(overviews.every((o) => o.stepsTotal === p.steps.length)).toBe(true);
    expect(overviews.some((o) => o.stepsDone > 0)).toBe(true);
    d.close();
  });

  it("filtre par statut (un seul run actif après clôture de l'autre)", async () => {
    const d = createDb(":memory:");
    const p = await seedReferenceProtocol(d, "lab1");

    const r1 = await startRun(d, "lab1", { operator: "op1", protocolId: p.id });
    await completeRun(d, r1.run.id);
    await startRun(d, "lab1", { operator: "op1", protocolId: p.id });

    const active = await listRunsOverview(d, "lab1", { status: "active" });
    expect(active.length).toBe(1);
    expect(active[0].run.status).toBe("active");
    d.close();
  });
});

describe("Live Bench — stepBack (annuler un advance)", () => {
  it("l'active repasse en attente, la précédente redevient active", async () => {
    const d = createDb(":memory:");
    const p = await seedReferenceProtocol(d, "lab1");
    const r = await startRun(d, "lab1", { operator: "op1", protocolId: p.id });

    await advanceStep(d, r.run.id); // étape 0 → done ; étape 1 → active
    const before = (await d.listSteps(r.run.id)).sort(
      (a, b) => a.protocolStepIndex - b.protocolStepIndex
    );
    expect(before[0].status).toBe("done");
    expect(before[1].status).toBe("active");

    await stepBack(d, r.run.id);
    const after = (await d.listSteps(r.run.id)).sort(
      (a, b) => a.protocolStepIndex - b.protocolStepIndex
    );
    expect(after[0].status).toBe("active"); // la précédente redevient active
    expect(after[0].completedAt).toBeUndefined(); // sa complétion est effacée
    expect(after[1].status).toBe("pending"); // l'ex-active repasse en attente
    d.close();
  });

  it("à la première étape, stepBack ne fait rien", async () => {
    const d = createDb(":memory:");
    const p = await seedReferenceProtocol(d, "lab1");
    const r = await startRun(d, "lab1", { operator: "op1", protocolId: p.id });

    await stepBack(d, r.run.id); // étape 0 déjà active, rien avant
    const steps = (await d.listSteps(r.run.id)).sort(
      (a, b) => a.protocolStepIndex - b.protocolStepIndex
    );
    expect(steps[0].status).toBe("active");
    d.close();
  });
});

import { describe, it, expect } from "vitest";
import { createDb } from "./db";

// Le seam en action : SQLite :memory: joue le rôle du « faux Db injecté ».
describe("Db seam (SQLite :memory:)", () => {
  it("versionne une page (protocol) : v1 latest, puis v2 latest", async () => {
    const db = createDb(":memory:");
    const v1 = await db.insertPage({ ws: "lab1", type: "protocol", title: "qPCR", content: { steps: 1 } });
    expect(v1.version).toBe(1);
    const v2 = await db.newPageVersion(v1.id, { content: { steps: 2 } });
    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id); // identifiant logique stable

    const latest = await db.getPage(v1.id);
    expect(latest?.version).toBe(2);
    const pinned = await db.getPage(v1.id, 1);
    expect(pinned?.content).toEqual({ steps: 1 });
    db.close();
  });

  it("crée un run + steps, avance un step, liste dans l'ordre", async () => {
    const db = createDb(":memory:");
    const run = await db.insertRun({
      ws: "lab1",
      operator: "u1",
      protocolId: "pg_x",
      protocolVersion: 1,
      scalingContext: { n_reactions: 24 },
    });
    expect(run.status).toBe("active");
    const s0 = await db.insertStep({ runId: run.id, protocolStepIndex: 0, title: "Prep", status: "pending" });
    await db.insertStep({ runId: run.id, protocolStepIndex: 1, title: "Mix", status: "pending" });
    const done = await db.updateStep(s0.id, { status: "done", completedAt: new Date().toISOString() });
    expect(done.status).toBe("done");
    const steps = await db.listSteps(run.id);
    expect(steps.map((s) => s.title)).toEqual(["Prep", "Mix"]);
    db.close();
  });

  it("attache une evidence (déviation) à un step et la retrouve", async () => {
    const db = createDb(":memory:");
    const run = await db.insertRun({ ws: "lab1", operator: "u1", protocolId: "pg_x", protocolVersion: 1, scalingContext: {} });
    const ev = await db.insertEvidence({
      runId: run.id,
      stepId: "stp_1",
      authorId: "u1",
      kind: "deviation",
      deviation: { expected: "60 °C", actual: "55 °C", severity: "critical" },
    });
    expect(ev.id).toMatch(/^ev_/);
    const list = await db.listEvidence(run.id, { kind: "deviation" });
    expect(list).toHaveLength(1);
    expect(list[0].deviation?.severity).toBe("critical");
    db.close();
  });

  it("indexe des embeddings et les relit avec leur vecteur", async () => {
    const db = createDb(":memory:");
    await db.insertEmbedding({ ws: "lab1", sourceType: "run", sourceId: "run_1", text: "incubation 12 min", vector: [0.1, 0.2] });
    const all = await db.listEmbeddings("lab1");
    expect(all).toHaveLength(1);
    expect(all[0].vector).toEqual([0.1, 0.2]);
    db.close();
  });
});

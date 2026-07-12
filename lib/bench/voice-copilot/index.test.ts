import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, getRunContext } from "../live-bench";
import { listEvidence } from "../evidence-capture";
import { indexEntry } from "@/lib/retrieval";
import { buildSystemPrompt, buildVoiceTools } from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_LAB_MEMORY = "true";
});

const opts = { toolCallId: "t1", messages: [] } as never;

async function seededRun(d: Db) {
  const proto = await seedReferenceProtocol(d, "lab1");
  return startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params: { n_reactions: 24 } });
}

describe("Voice Copilot", () => {
  it("le system prompt porte le master mix calculé et les étapes critiques", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const sys = buildSystemPrompt(ctx);
    expect(sys).toContain("264");
    expect(sys).toContain("475.2");
    expect(sys).toContain("[CRITIQUE]");
    d.close();
  });

  it("le system prompt est en anglais par défaut et adaptatif à la langue de l'opérateur", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const sysDefault = buildSystemPrompt(ctx); // défaut = anglais désormais
    expect(sysDefault).toContain("English by default");
    expect(sysDefault).toContain("reply in that same language"); // adaptativité
    const sysFr = buildSystemPrompt(ctx, "fr");
    expect(sysFr).toContain("français");
    // l'état du run reste présent quelle que soit la langue
    expect(sysDefault).toContain("[CRITIQUE]");
    d.close();
  });

  it("le system prompt inclut l'instruction complète de CHAQUE étape (pas que le titre)", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const sys = buildSystemPrompt(ctx);
    // une étape NON courante (index 3) : son instruction complète doit être présente,
    // pour que l'agent puisse la décrire sans avoir à avancer dessus.
    const future = ctx.protocol.steps.find((p) => p.index === 3)!;
    expect(future.instruction.length).toBeGreaterThan(0);
    expect(sys).toContain(future.instruction);
    d.close();
  });

  it("le system prompt interdit d'avancer juste pour montrer une étape", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const sys = buildSystemPrompt(ctx);
    expect(sys).toContain("sans avancer");
    d.close();
  });

  it("read_step renvoie le détail d'une étape future SANS modifier l'état du run", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const tools = buildVoiceTools({ db: d, ws: "lab1", runId: ctx.run.id, operator: "u1" });

    const before = (await d.listSteps(ctx.run.id)).map((s) => ({
      i: s.protocolStepIndex,
      status: s.status,
    }));

    const res = (await tools.read_step.execute!({ index: 3 }, opts)) as {
      index: number;
      title: string;
      instruction: string;
      status: string;
      critical: boolean;
    };
    const proto3 = ctx.protocol.steps.find((p) => p.index === 3)!;
    expect(res.index).toBe(3);
    expect(res.title).toBe(proto3.title);
    expect(res.instruction).toBe(proto3.instruction);
    expect(res.status).toBe("pending"); // étape future : toujours en attente
    expect(res.critical).toBe(proto3.critical ?? false);

    // AUCUNE mutation : les statuts sont identiques avant/après.
    const after = (await d.listSteps(ctx.run.id)).map((s) => ({
      i: s.protocolStepIndex,
      status: s.status,
    }));
    expect(after).toEqual(before);
    d.close();
  });

  it("read_step sur un index inexistant renvoie found:false", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const tools = buildVoiceTools({ db: d, ws: "lab1", runId: ctx.run.id, operator: "u1" });
    const res = (await tools.read_step.execute!({ index: 999 }, opts)) as { found: boolean };
    expect(res.found).toBe(false);
    d.close();
  });

  it("l'outil next_step fait avancer le run", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const tools = buildVoiceTools({ db: d, ws: "lab1", runId: ctx.run.id, operator: "u1" });
    const res = (await tools.next_step.execute!({}, opts)) as { active: { index: number } | null };
    expect(res.active?.index).toBe(1);
    d.close();
  });

  it("l'outil flag_deviation enregistre une déviation critique attachée à l'étape courante", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    const tools = buildVoiceTools({ db: d, ws: "lab1", runId: ctx.run.id, operator: "u1" });
    await tools.flag_deviation.execute!(
      { expected: "60 °C", actual: "55 °C", severity: "critical", reason: "SYBR non-spécifique" },
      opts
    );
    const evs = await listEvidence(d, ctx.run.id, { kind: "deviation" });
    expect(evs).toHaveLength(1);
    expect(evs[0].deviation?.severity).toBe("critical");
    // rattachée à l'étape active
    const rc = await getRunContext(d, ctx.run.id);
    expect(evs[0].stepId).toBe(rc?.currentStep?.id);
    d.close();
  });

  it("l'outil query_memory retrouve une entrée indexée", async () => {
    const d = createDb(":memory:");
    const ctx = await seededRun(d);
    await indexEntry(d, {
      ws: "lab1",
      sourceType: "run",
      sourceId: "run_passe",
      text: "hybridation menée à 55 °C au lieu de 60, déviation critique",
    });
    const tools = buildVoiceTools({ db: d, ws: "lab1", runId: ctx.run.id, operator: "u1" });
    const res = (await tools.query_memory.execute!({ query: "hybridation déviation", k: 5 }, opts)) as {
      results: Array<{ id: string }>;
    };
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].id).toBe("run_passe");
    d.close();
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, advanceStep, completeRun } from "../live-bench";
import { captureNote, captureMeasurement, captureDeviation } from "../evidence-capture";
import { generateReport, getReport, exportReportMarkdown } from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_AUTO_REPORT = "true";
  delete process.env.ANTHROPIC_API_KEY; // force le repli déterministe hors-ligne
});

async function runWithEvidence(d: Db) {
  const proto = await seedReferenceProtocol(d, "lab1");
  const ctx = await startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params: { n_reactions: 24 } });
  const mmStep = ctx.steps.find((s) => /master mix qpcr/i.test(s.title))!;
  await captureNote(d, ctx.run.id, mmStep.id, "SYBR protégé de la lumière", "u1");
  await captureMeasurement(d, ctx.run.id, mmStep.id, { name: "Ct GAPDH", value: 21.4, unit: "Ct" }, "u1");
  await captureDeviation(
    d,
    ctx.run.id,
    mmStep.id,
    { expected: "hybridation 60 °C", actual: "hybridation 55 °C", severity: "critical", reason: "consigne mal réglée" },
    "u1"
  );
  await advanceStep(d, ctx.run.id);
  await completeRun(d, ctx.run.id);
  return ctx.run.id;
}

describe("Auto Report (repli déterministe, sans LLM)", () => {
  it("intègre les chiffres déterministes du master mix (264 / 475,2) dans le prévu", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const report = await generateReport(d, runId);
    expect(report.content.planned).toContain("264");
    expect(report.content.planned).toContain("475.2");
    d.close();
  });

  it("liste la déviation critique et cite chaque preuve", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const report = await generateReport(d, runId);
    expect(report.content.deviations.some((x) => x.includes("critique") && x.includes("55 °C"))).toBe(true);
    // 3 evidences → 3 citations, chacune avec un id ev_*
    expect(report.content.citations.length).toBe(3);
    expect(report.content.citations.every((c) => c.evidenceIds[0].startsWith("ev_"))).toBe(true);
    d.close();
  });

  it("distingue prévu / fait / observé / interprété et se relit via getReport", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    await generateReport(d, runId);
    const again = await getReport(d, runId);
    expect(again).not.toBeNull();
    expect(again!.content.observed).toContain("SYBR protégé");
    expect(again!.content.interpretation.toLowerCase()).toContain("valider");
    const md = await exportReportMarkdown(d, runId);
    expect(md).toContain("# Rapport");
    expect(md).toContain("Réellement fait");
    d.close();
  });
});

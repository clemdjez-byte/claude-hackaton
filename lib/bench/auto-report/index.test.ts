import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { configureLlm, type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, advanceStep, completeRun } from "../live-bench";
import {
  captureNote,
  captureMeasurement,
  captureDeviation,
  capturePhoto,
  capturePhotoRef,
} from "../evidence-capture";
import { generateReport, getReport, exportReportMarkdown } from "./index";

/** Extrait le HTML d'une section `<h2>Titre</h2> … <h2>…` du document. */
function section(html: string, title: string): string {
  return html.split(`<h2>${title}</h2>`)[1]?.split("<h2>")[0] ?? "";
}

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_AUTO_REPORT = "true";
  delete process.env.ANTHROPIC_API_KEY; // force le repli déterministe hors-ligne
});

afterEach(() => {
  configureLlm(null); // restaure le provider par défaut après chaque test
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
  it("intègre les chiffres déterministes du master mix (264 / 475,2) dans le document HTML", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const report = await generateReport(d, runId);
    expect(report.html.length).toBeGreaterThan(0);
    expect(report.html).toContain("264");
    expect(report.html).toContain("475.2");
    d.close();
  });

  it("liste la déviation critique et cite chaque preuve", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const report = await generateReport(d, runId);
    expect(report.html).toContain("critical");
    expect(report.html).toContain("55 °C");
    // 3 evidences capturées → 3 ids cités dans l'annexe citations du document.
    const citedIds = new Set(report.html.match(/ev_[A-Za-z0-9]+/g));
    expect(citedIds.size).toBe(3);
    d.close();
  });

  it("distingue prévu / fait / observé / interprété et se relit via getReport", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    await generateReport(d, runId);
    const again = await getReport(d, runId);
    expect(again).not.toBeNull();
    expect(again!.html).toContain("SYBR protégé");
    expect(again!.html.toLowerCase()).toContain("validated");
    const md = await exportReportMarkdown(d, runId);
    expect(md).toContain("# Report");
    expect(md).toContain("Performed");
    d.close();
  });

  it("repli déterministe aussi quand la clé existe mais que l'appel LLM échoue (ex: clé invalide → 401)", async () => {
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => {
        throw new Error("non utilisé dans ce test");
      },
      generateObjectFor: async () => {
        throw new Error("401 invalid x-api-key");
      },
      generateProse: async () => {
        throw new Error("401 invalid x-api-key");
      },
    });
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const report = await generateReport(d, runId); // ne doit PAS jeter
    expect(report.html).toContain("Interpretation");
    expect(report.html.toLowerCase()).toContain("validated");
    d.close();
  });

  it("repli hors-ligne : exportReportMarkdown régénère le rapport s'il n'existe pas encore", async () => {
    const d = createDb(":memory:");
    const runId = await runWithEvidence(d);
    const md = await exportReportMarkdown(d, runId); // pas de generateReport préalable
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain("# Report");
    d.close();
  });
});

describe("Auto Report — section Result (images inline)", () => {
  async function startRunAtResult(d: Db) {
    const proto = await seedReferenceProtocol(d, "lab1");
    const ctx = await startRun(d, "lab1", {
      operator: "u1",
      protocolId: proto.id,
      params: { n_reactions: 24 },
    });
    const resultStep = ctx.steps.find((s) => /results/i.test(s.title))!;
    expect(resultStep).toBeTruthy();
    return { ctx, resultStep };
  }

  it("rend une photo (brique capturePhoto → fileId) en image inline dans la section Result", async () => {
    const d = createDb(":memory:");
    const { ctx, resultStep } = await startRunAtResult(d);
    await capturePhoto(
      d,
      "lab1",
      ctx.run.id,
      resultStep.id,
      { bytes: Buffer.from("fakepng"), mime: "image/png", sha256: "abc123def456" },
      "u1",
      "Gel final"
    );
    await completeRun(d, ctx.run.id);
    const report = await generateReport(d, ctx.run.id);

    const resultSection = section(report.html, "Result");
    expect(resultSection).toContain('<img src="/api/files/');
    expect(resultSection).toContain('alt="Gel final"');
    // Pas de double-comptage : la photo n'est pas re-listée en texte dans Observed.
    expect(section(report.html, "Observed")).not.toContain("Gel final");
    // Trace textuelle conservée dans l'export/MCP.
    expect(await exportReportMarkdown(d, ctx.run.id)).toContain("[Photo: Gel final]");
    d.close();
  });

  it("rend une photo capturée par référence (console de run → source.ref) via /api/files", async () => {
    const d = createDb(":memory:");
    const { ctx, resultStep } = await startRunAtResult(d);
    await capturePhotoRef(
      d,
      ctx.run.id,
      resultStep.id,
      { storageKey: "fichier_42", label: "scope.png" },
      "u1"
    );
    await completeRun(d, ctx.run.id);
    const report = await generateReport(d, ctx.run.id);
    expect(section(report.html, "Result")).toContain('src="/api/files/fichier_42"');
    d.close();
  });

  it("affiche un placeholder quand l'étape Results est vide", async () => {
    const d = createDb(":memory:");
    const { ctx } = await startRunAtResult(d);
    await completeRun(d, ctx.run.id);
    const report = await generateReport(d, ctx.run.id);
    expect(report.html).toContain("<h2>Result</h2>");
    expect(section(report.html, "Result")).toMatch(/No result recorded yet/i);
    d.close();
  });
});

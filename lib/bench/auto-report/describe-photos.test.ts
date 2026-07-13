import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { configureLlm, type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "../protocol-studio";
import { startRun, completeRun } from "../live-bench";
import { capturePhoto, capturePhotoRef } from "../evidence-capture";
import { describePhotos } from "./describe-photos";
import { generateReport } from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_AUTO_REPORT = "true";
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  configureLlm(null);
});

async function runWithPhoto(d: Db) {
  const proto = await seedReferenceProtocol(d, "lab1");
  const ctx = await startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params: { n_reactions: 24 } });
  const mmStep = ctx.steps.find((s) => /master mix qpcr/i.test(s.title))!;
  const evidence = await capturePhoto(
    d,
    "lab1",
    ctx.run.id,
    mmStep.id,
    { bytes: Buffer.from("fakepng"), mime: "image/png", sha256: "abc123def456" },
    "u1",
    "Tube rack"
  );
  return { runId: ctx.run.id, evidence };
}

describe("describePhotos (best-effort, ne jette jamais)", () => {
  it("retourne une map vide sans clé LLM", async () => {
    const d = createDb(":memory:");
    const { evidence } = await runWithPhoto(d);
    const out = await describePhotos(d, [{ evidence }]);
    expect(out.size).toBe(0);
    d.close();
  });

  it("échec du provider (modelFor jette) → map vide, et generateReport réussit quand même", async () => {
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => {
        throw new Error("provider cassé");
      },
      generateObjectFor: async () => {
        throw new Error("401 invalid x-api-key");
      },
      generateProse: async () => {
        throw new Error("401 invalid x-api-key");
      },
    });
    const d = createDb(":memory:");
    const { runId, evidence } = await runWithPhoto(d);
    const out = await describePhotos(d, [{ evidence, stepTitle: "Master mix qPCR" }]);
    expect(out.size).toBe(0);
    await completeRun(d, runId);
    const report = await generateReport(d, runId); // ne doit PAS jeter
    expect(report.html).toContain('alt="Tube rack"');
    expect(report.html).not.toContain("data-description=");
    d.close();
  });

  it("photo par référence vers un fichier inexistant → ignorée en silence", async () => {
    configureLlm({
      hasLlmKey: () => true,
      modelFor: () => {
        throw new Error("ne doit pas être appelé : pas de bytes");
      },
      generateObjectFor: async () => {
        throw new Error("non utilisé");
      },
      generateProse: async () => {
        throw new Error("non utilisé");
      },
    });
    const d = createDb(":memory:");
    const proto = await seedReferenceProtocol(d, "lab1");
    const ctx = await startRun(d, "lab1", { operator: "u1", protocolId: proto.id, params: { n_reactions: 24 } });
    const evidence = await capturePhotoRef(
      d,
      ctx.run.id,
      ctx.steps[0].id,
      { storageKey: "fichier_42", label: "scope.png" },
      "u1"
    );
    const out = await describePhotos(d, [{ evidence }]);
    expect(out.size).toBe(0);
    d.close();
  });
});

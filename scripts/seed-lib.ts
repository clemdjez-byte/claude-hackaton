// scripts/seed-lib.ts — shared pipeline for the notebook seeds (AML, fluo, …).
// For each RunSpec: startRun → capture evidence (notes + measurement + deviation)
// → completeRun → generateReport (English) → saveOutcome → RAG index → SIGN the
// report (ELN-lock, triggers KG extraction) → KG extraction. Dates are backdated
// afterward. This module is pipeline-only; each seed script supplies its plans.
import Database from "better-sqlite3";
import {
  createProtocol,
  publishProtocol,
  startRun,
  captureNote,
  captureMeasurement,
  captureDeviation,
  completeRun,
  generateReport,
  exportReportMarkdown,
} from "@/lib/bench";
import type { StoredReport } from "@/lib/bench/auto-report";
import type { Db, Protocol } from "@/lib/core";
import { WS } from "@/lib/session";
import { indexProtocol, indexReport } from "@/lib/rag";
import { saveOutcome } from "@/lib/retrieval/knowledge-graph/outcome";
import { indexProtocolGraph, indexRunGraph } from "@/lib/kg";
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";
import type { RunSpec } from "./aml-common";

export interface SeedPlan {
  key: string; // "P1".."P6" / "F1".."F6"
  draft: ProtocolDraft;
  runs: RunSpec[];
}
export interface RunStamp {
  runId: string;
  date: string;
}
export interface ProtoStamp {
  pageId: string;
  date: string;
}

// ── Historical timestamps derived from a run's YYYY-MM-DD ────────────────────
function stamps(date: string) {
  return {
    start: `${date}T09:00:00.000Z`,
    mid: `${date}T11:00:00.000Z`,
    end: `${date}T13:00:00.000Z`,
    gen: `${date}T13:05:00.000Z`,
    signed: `${date}T14:00:00.000Z`,
  };
}

/** Sign a report like app/api/bench/report/[id]/sign/route.ts does, stamped with
 *  historical generated/signed dates (the body caption is rewritten to match). */
async function signReport(store: Db, report: StoredReport, date: string, operator: string): Promise<void> {
  if (report.signedAt) return;
  const s = stamps(date);
  await store.newPageVersion(report.id, {
    content: {
      runId: report.runId,
      protocolTitle: report.protocolTitle,
      generatedAt: s.gen,
      html: report.html.replace(report.generatedAt, s.gen),
      signedAt: s.signed,
      signedBy: operator,
    },
  });
}

async function seedRun(store: Db, protocol: Protocol, spec: RunSpec, operator: string): Promise<RunStamp | null> {
  try {
    const { run, steps } = await startRun(store, WS, {
      operator,
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      params: spec.params,
    });
    for (const note of spec.notes) await captureNote(store, run.id, undefined, note, operator);
    if (spec.measurement) await captureMeasurement(store, run.id, undefined, spec.measurement, operator);
    if (spec.deviation) await captureDeviation(store, run.id, undefined, spec.deviation, operator);

    // Attach the result note to the protocol's auto "Results" step so it lands in
    // the report's Result section (buildResult renders a note in full; the headline
    // number lives in the note prose). No-op for specs without `result` (AML/fluo)
    // and for protocols sealed before the Results feature (no such step).
    if (spec.result?.note) {
      const resultStep = steps.find((s) => s.title === "Results");
      if (resultStep) await captureNote(store, run.id, resultStep.id, spec.result.note, operator);
    }

    const completed = await completeRun(store, run.id);
    const report = await generateReport(store, run.id); // English interpretation (AI)

    // Verdict FIRST so the KG reuses our explicit outcome (lib/kg.ts getOutcomeByRun).
    await saveOutcome(store, {
      ws: WS,
      runId: run.id,
      verdict: spec.verdict,
      metric: spec.measurement ? { value: spec.measurement.value, unit: spec.measurement.unit } : undefined,
      reason: spec.reason,
    });

    const s = stamps(spec.date);
    const histRun = { ...completed, startedAt: s.start, endedAt: s.end };
    await indexReport(store, report, await exportReportMarkdown(store, run.id)); // RAG
    await signReport(store, report, spec.date, operator); // ELN sign
    await indexRunGraph(store, histRun, steps, protocol); // KG
    return { runId: run.id, date: spec.date };
  } catch (e) {
    console.error(`  ✗ run "${spec.slug}" (${spec.date}) failed:`, (e as Error).message);
    return null;
  }
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Create + publish each protocol, then run every RunSpec through the pipeline. */
export async function seedPlans(
  store: Db,
  plans: SeedPlan[],
  operator: string
): Promise<{ runStamps: RunStamp[]; protoStamps: ProtoStamp[] }> {
  const runStamps: RunStamp[] = [];
  const protoStamps: ProtoStamp[] = [];
  for (const plan of plans) {
    const created = await createProtocol(store, WS, plan.draft);
    const published = await publishProtocol(store, created.id);
    await indexProtocol(store, published);
    await indexProtocolGraph(store, published);
    protoStamps.push({ pageId: published.id, date: dayBefore(plan.runs[0]?.date ?? "2021-01-01") });
    console.log(`✓ ${plan.key} published: "${published.title}" (v${published.version}) — ${plan.runs.length} runs`);

    let n = 0;
    for (const spec of plan.runs) {
      const st = await seedRun(store, published, spec, operator);
      if (st) {
        runStamps.push(st);
        n += 1;
        process.stdout.write(`  · ${spec.date} ${spec.slug} [${spec.verdict}]\n`);
      }
    }
    console.log(`  → ${n}/${plan.runs.length} runs seeded for ${plan.key}\n`);
  }
  return { runStamps, protoStamps };
}

// ── Backdating: set historical dates on rows the pipeline stamped with now() ──
export function backdate(runs: RunStamp[], protos: ProtoStamp[]): void {
  const path = process.env.OCTOPUS_DB_PATH || "data/octopus.db";
  const sql = new Database(path);

  const updRun = sql.prepare(`UPDATE run SET started_at = @start, ended_at = @end WHERE id = @runId`);
  const updStep = sql.prepare(
    `UPDATE step SET
       started_at   = CASE WHEN started_at   IS NOT NULL THEN @start ELSE started_at   END,
       completed_at = CASE WHEN completed_at IS NOT NULL THEN @end   ELSE completed_at END
     WHERE run_id = @runId`
  );
  const updEv = sql.prepare(`UPDATE evidence SET captured_at = @mid WHERE run_id = @runId`);
  const selRep = sql.prepare(
    `SELECT row_id, content FROM page WHERE type = 'report' AND json_extract(content, '$.runId') = ?`
  );
  const updRep = sql.prepare(`UPDATE page SET content = @content, created_at = @created WHERE row_id = @rowId`);
  const updProto = sql.prepare(`UPDATE page SET created_at = @created WHERE id = @pageId`);

  const tx = sql.transaction(() => {
    for (const { runId, date } of runs) {
      const s = stamps(date);
      updRun.run({ runId, start: s.start, end: s.end });
      updStep.run({ runId, start: s.start, end: s.end });
      updEv.run({ runId, mid: s.mid });
      for (const r of selRep.all(runId) as { row_id: number; content: string }[]) {
        const c = JSON.parse(r.content) as Record<string, unknown>;
        c.generatedAt = s.gen;
        if (c.signedAt) c.signedAt = s.signed;
        updRep.run({ rowId: r.row_id, content: JSON.stringify(c), created: s.signed });
      }
    }
    for (const { pageId, date } of protos) {
      updProto.run({ pageId, created: `${date}T08:00:00.000Z` });
    }
  });
  tx();
  sql.close();
}

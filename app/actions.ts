"use server";
// app/actions.ts — Server Actions (mutations UI). Lisent le db côté serveur,
// délèguent aux briques, revalident la page. La clé LLM ne quitte jamais le serveur.
import { revalidatePath } from "next/cache";
import { getDb, type ResolvedRecipe } from "@/lib/core";
import { DEMO_WS, DEMO_OPERATOR, ensureSeed, finishRun, queryMemory } from "@/lib/orchestrate";
import {
  getProtocol,
  listProtocols,
  previewScaledRecipe,
  adaptProtocol,
} from "@/features/protocol-studio";
import { startRun, advanceStep } from "@/features/live-bench";
import { captureNote, captureDeviation, captureMeasurement } from "@/features/evidence-capture";

export async function scalePreviewAction(
  protocolId: string,
  n: number,
  overage: number
): Promise<ResolvedRecipe | null> {
  const db = getDb();
  const proto = await getProtocol(db, protocolId);
  if (!proto) return null;
  return previewScaledRecipe(proto, n, overage);
}

export async function adaptProtocolAction(
  protocolId: string,
  instruction: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDb();
    await adaptProtocol(db, protocolId, instruction);
    revalidatePath(`/protocol/${protocolId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Adaptation impossible" };
  }
}

export async function startRunAction(
  protocolId: string,
  n: number,
  overage: number
): Promise<{ runId: string }> {
  const db = getDb();
  const ctx = await startRun(db, DEMO_WS, {
    operator: DEMO_OPERATOR,
    protocolId,
    params: { n_reactions: n, overage_pct: overage },
  });
  return { runId: ctx.run.id };
}

export async function advanceStepAction(runId: string): Promise<void> {
  const db = getDb();
  await advanceStep(db, runId);
  revalidatePath(`/run/${runId}`);
}

export async function noteAction(runId: string, stepId: string | undefined, text: string): Promise<void> {
  const db = getDb();
  await captureNote(db, runId, stepId, text, DEMO_OPERATOR);
  revalidatePath(`/run/${runId}`);
}

export async function measurementAction(
  runId: string,
  stepId: string | undefined,
  name: string,
  value: number,
  unit: string
): Promise<void> {
  const db = getDb();
  await captureMeasurement(db, runId, stepId, { name, value, unit }, DEMO_OPERATOR);
  revalidatePath(`/run/${runId}`);
}

export async function deviationAction(
  runId: string,
  stepId: string | undefined,
  expected: string,
  actual: string,
  severity: "minor" | "major" | "critical",
  reason?: string
): Promise<void> {
  const db = getDb();
  await captureDeviation(db, runId, stepId, { expected, actual, severity, reason }, DEMO_OPERATOR);
  revalidatePath(`/run/${runId}`);
}

export async function finishRunAction(runId: string): Promise<{ reportId: string | null }> {
  const db = getDb();
  const res = await finishRun(db, runId);
  revalidatePath(`/run/${runId}`);
  revalidatePath(`/report/${runId}`);
  return { reportId: res.reportId };
}

export async function memorySearchAction(q: string): Promise<Array<{ id: string; type: string; text: string; score: number }>> {
  const db = getDb();
  const hits = await queryMemory(db, DEMO_WS, q, 6);
  return hits.map((h) => ({ id: h.sourceId, type: h.sourceType, text: h.text, score: Math.round(h.score * 100) / 100 }));
}

export async function ensureSeedAction(): Promise<void> {
  await ensureSeed(getDb());
}

export async function firstProtocolIdAction(): Promise<string | null> {
  const db = getDb();
  await ensureSeed(db);
  const list = await listProtocols(db, DEMO_WS);
  return list[0]?.id ?? null;
}

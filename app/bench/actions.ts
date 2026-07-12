"use server";

// Server actions du Bench — partie « Protocol Studio ». Chaque action résout
// le contexte de la brique (getBenchSession), appelle une fonction de brique
// avec le store, puis soit ne renvoie rien (le panneau appelant recharge
// lui-même via son propre reload(), pas de revalidatePath — les routes
// /bench/* n'existent plus), soit retourne l'id créé (le panneau ouvre alors
// la fenêtre suivante via useWindowsContext().open — plus de redirect() : les
// surfaces sont des panneaux montés, pas des routes). Les nombres viennent du
// calcul déterministe, jamais du LLM.
import {
  startRun,
  generateProtocol,
  adaptProtocol,
  publishProtocol,
  sealDraft,
  advanceStep,
  skipStep,
  stepBack,
  pauseRun,
  resumeRun,
  completeRun,
  captureNote,
  captureMeasurement,
  captureDeviation,
  deleteEvidence,
  getRunContext,
  generateReport,
  exportReportMarkdown,
} from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";
import { indexProtocol, indexEvidence, indexRun, indexReport, linkRunToProtocol, linkReportToRun } from "@/lib/rag";
import { indexProtocolGraph } from "@/lib/kg";

// ── Protocoles (bibliothèque) ─────────────────────────────────────────────

/** Crée un protocole depuis une description libre (brief). Le panneau ouvre
 *  ensuite la fiche via open('protocol', {protocolId}). */
export async function generateProtocolAction(brief: string): Promise<{ protocolId: string }> {
  const { store } = getBenchSession();
  const protocol = await generateProtocol(store, WS, brief);
  return { protocolId: protocol.id };
}

/** Adapte un protocole existant via une instruction en langage naturel
 *  (nouvelle version, même id logique). */
export async function adaptProtocolAction(protocolId: string, instruction: string): Promise<void> {
  const { store } = getBenchSession();
  await adaptProtocol(store, protocolId, instruction);
}

/** Publie un protocole (refuse sans source, côté brique). */
export async function publishProtocolAction(protocolId: string): Promise<void> {
  const { store } = getBenchSession();
  const protocol = await publishProtocol(store, protocolId);
  await indexProtocol(store, protocol);
  await indexProtocolGraph(store, protocol);
}

/** Fige une version immuable depuis le brouillon (draft_doc), sans publier. */
export async function sealDraftAction(protocolId: string): Promise<void> {
  const { store } = getBenchSession();
  const { protocol } = await sealDraft(store, protocolId);
  await indexProtocol(store, protocol);
  await indexProtocolGraph(store, protocol);
}

/** Fige une version depuis le brouillon puis démarre un run dessus (épingle
 *  la version FIGÉE, pas le brouillon mutable). Le panneau ouvre ensuite la
 *  console via open('run', {runId}). */
export async function startRunAction(
  protocolId: string,
  n: number,
  overage: number
): Promise<{ runId: string }> {
  const { store, ctx } = getBenchSession();
  const { version, protocol } = await sealDraft(store, protocolId);
  await indexProtocol(store, protocol);
  await indexProtocolGraph(store, protocol);
  const runCtx = await startRun(store, WS, {
    operator: ctx.userId,
    protocolId,
    protocolVersion: version, // épingle la version FIGÉE, pas le brouillon mutable
    params: { n_reactions: n, overage_pct: overage },
  });
  await linkRunToProtocol(store, runCtx.run.id, protocolId); // best-effort, cf. lib/rag.ts
  return { runId: runCtx.run.id };
}

// ── Console de run (paillasse live) ───────────────────────────────────────

export async function advanceStepAction(runId: string): Promise<void> {
  const { store } = getBenchSession();
  await advanceStep(store, runId);
}

export async function skipStepAction(runId: string, stepId: string): Promise<void> {
  const { store } = getBenchSession();
  await skipStep(store, stepId);
}

/** Recule d'une étape (annule un « Done » accidentel). */
export async function stepBackAction(runId: string): Promise<void> {
  const { store } = getBenchSession();
  await stepBack(store, runId);
}

export async function pauseRunAction(runId: string): Promise<void> {
  const { store } = getBenchSession();
  await pauseRun(store, runId);
}

export async function resumeRunAction(runId: string): Promise<void> {
  const { store } = getBenchSession();
  await resumeRun(store, runId);
}

export async function captureNoteAction(
  runId: string,
  stepId: string | undefined,
  text: string
): Promise<void> {
  const { store, ctx } = getBenchSession();
  const evidence = await captureNote(store, runId, stepId, text, ctx.userId);
  await indexEvidence(store, evidence);
}

export async function captureMeasurementAction(
  runId: string,
  stepId: string | undefined,
  m: { name?: string; value: number; unit: string; instrument?: string }
): Promise<void> {
  const { store, ctx } = getBenchSession();
  const evidence = await captureMeasurement(store, runId, stepId, m, ctx.userId);
  await indexEvidence(store, evidence);
}

export async function captureDeviationAction(
  runId: string,
  stepId: string | undefined,
  d: { expected: string; actual: string; reason?: string; severity: "minor" | "major" | "critical" }
): Promise<void> {
  const { store, ctx } = getBenchSession();
  const evidence = await captureDeviation(store, runId, stepId, d, ctx.userId);
  await indexEvidence(store, evidence);
}

/** Supprime une observation (note, mesure, déviation, photo, data). Les bytes
 *  d'un éventuel fichier attaché (photo / data) restent dans la table `fichier`
 *  (pas de nettoyage — acceptable pour la démo standalone, cf. Task 4 brief §10). */
export async function deleteEvidenceAction(runId: string, evidenceId: string): Promise<void> {
  const { store } = getBenchSession();
  await deleteEvidence(store, evidenceId);
}

/** Termine le run, génère le rapport auditable (Brique Auto Report — repli
 *  hors-ligne déterministe si aucune clé LLM), indexe le tout dans la mémoire
 *  du lab (best-effort), puis retourne l'id : le panneau ouvre ensuite le
 *  rapport via open('report', {runId}). La génération du rapport et
 *  l'indexation sont best-effort : avec une clé LLM, un appel qui échoue ne
 *  doit pas rendre le run orphelin (déjà completed, sans rapport). Le
 *  panneau rapport régénère si besoin au chargement. */
export async function completeRunAction(runId: string): Promise<{ runId: string }> {
  const { store } = getBenchSession();
  // Capturé avant complétion : titre du protocole + étapes, pour l'indexation du run.
  const ctx = await getRunContext(store, runId);
  const run = await completeRun(store, runId);
  try {
    const report = await generateReport(store, runId);
    await linkReportToRun(store, report.id, runId); // best-effort, cf. lib/rag.ts
    if (ctx) await indexRun(store, run, ctx.protocol.title, ctx.steps);
    const markdown = await exportReportMarkdown(store, runId);
    await indexReport(store, report, markdown);
  } catch {
    // best-effort — le panneau rapport régénère au chargement si absent
  }
  return { runId };
}

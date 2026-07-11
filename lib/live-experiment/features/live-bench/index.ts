// features/live-bench/index.ts — Brique 3.
// Responsabilité unique : instancier un Run, FIGER la version du protocole + le
// scaling déterministe, piloter l'avancement step-by-step. Point de rendez-vous
// de toutes les briques d'exécution (Evidence s'y accroche, Auto Report le lit).
import {
  assertEnabled,
  scaleMasterMix,
  type Db,
  type Id,
  type Protocol,
  type Quantity,
  type ResolvedRecipe,
  type Run,
  type Step,
  type Ws,
} from "../../core";
import { getProtocol } from "../protocol-studio";

export interface StartRunInput {
  operator: Id;
  protocolId: Id;
  protocolVersion?: number; // ATTENTION : `latest` est MUTABLE depuis draft_doc — toujours passer une version issue de sealDraft (jamais épingler latest pour un run reproductible).
  workflowId?: Id;
  workflowVersion?: number;
  params?: Record<string, number>; // ex. { n_reactions: 24, overage_pct: 10 }
}

export interface RunState {
  run: Run;
  steps: Step[];
}

export interface RunContext extends RunState {
  protocol: Protocol;
  scaledRecipe: ResolvedRecipe | null;
  currentStep: Step | null;
}

const MASTER_MIX_RE = /master\s?mix|mix partag/i;

function resolveScaling(protocol: Protocol, params?: Record<string, number>): {
  scalingContext: Record<string, number>;
  n: number;
  overage: number;
} {
  const def = (key: string, fallback: number) =>
    params?.[key] ?? protocol.parameters.find((p) => p.key === key)?.default ?? fallback;
  const n = def("n_reactions", 6);
  const overage = def("overage_pct", 10);
  return { scalingContext: { ...params, n_reactions: n, overage_pct: overage }, n, overage };
}

/** Démarre un run : fige la version du protocole et le résultat du calcul
 *  déterministe (le master mix mis à l'échelle est écrit dans le step concerné). */
export async function startRun(db: Db, ws: Ws, input: StartRunInput): Promise<RunContext> {
  assertEnabled("liveBench");
  const protocol = await getProtocol(db, input.protocolId, input.protocolVersion);
  if (!protocol) throw new Error(`Protocole introuvable : ${input.protocolId}`);

  const { scalingContext, n, overage } = resolveScaling(protocol, input.params);
  const scaledRecipe = protocol.recipe ? scaleMasterMix(protocol.recipe, n, overage) : null;

  const run = await db.insertRun({
    ws,
    operator: input.operator,
    workflowId: input.workflowId,
    workflowVersion: input.workflowVersion,
    protocolId: protocol.id,
    protocolVersion: protocol.version, // FIGÉ
    scalingContext,
  });

  const steps: Step[] = [];
  for (const ps of protocol.steps) {
    const isMasterMix = scaledRecipe != null && MASTER_MIX_RE.test(ps.title);
    const resolvedParams = isMasterMix ? scaledComponentsToParams(scaledRecipe!) : undefined;
    const step = await db.insertStep({
      runId: run.id,
      protocolStepIndex: ps.index,
      title: ps.title,
      status: ps.index === 0 ? "active" : "pending",
      resolvedParams,
      startedAt: ps.index === 0 ? new Date().toISOString() : undefined,
    });
    steps.push(step);
  }

  return { run, steps, protocol, scaledRecipe, currentStep: steps[0] ?? null };
}

/** Avance : clôt le step actif (ou le premier en attente), active le suivant. */
export async function advanceStep(
  db: Db,
  runId: Id,
  targetStepId?: Id
): Promise<{ justCompleted: Step | null; active: Step | null }> {
  assertEnabled("liveBench");
  const steps = await db.listSteps(runId);

  const toComplete =
    (targetStepId ? steps.find((s) => s.id === targetStepId) : undefined) ??
    steps.find((s) => s.status === "active") ??
    steps.find((s) => s.status === "pending") ??
    null;

  let justCompleted: Step | null = null;
  if (toComplete && toComplete.status !== "done") {
    justCompleted = await db.updateStep(toComplete.id, {
      status: "done",
      completedAt: new Date().toISOString(),
    });
  }

  const next = steps.find(
    (s) => s.status === "pending" && s.id !== toComplete?.id
  );
  let active: Step | null = null;
  if (next) {
    active = await db.updateStep(next.id, {
      status: "active",
      startedAt: new Date().toISOString(),
    });
  }
  return { justCompleted, active };
}

export async function skipStep(db: Db, stepId: Id): Promise<Step> {
  assertEnabled("liveBench");
  return db.updateStep(stepId, { status: "skipped", completedAt: new Date().toISOString() });
}

/** Recule d'une étape : annule un « advance » accidentel. L'étape active
 *  repasse en attente, et la précédente (déjà faite/sautée) redevient active. */
export async function stepBack(db: Db, runId: Id): Promise<{ active: Step | null }> {
  assertEnabled("liveBench");
  const steps = (await db.listSteps(runId)).sort(
    (a, b) => a.protocolStepIndex - b.protocolStepIndex
  );
  const activePos = steps.findIndex((s) => s.status === "active");
  // Curseur = position de l'étape active ; si aucune (toutes faites), après la dernière.
  const cursor = activePos === -1 ? steps.length : activePos;
  if (cursor === 0) return { active: steps[0] ?? null }; // déjà à la première étape
  const prev = steps[cursor - 1];

  if (activePos !== -1) {
    await db.updateStep(steps[activePos].id, {
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
    });
  }
  const active = await db.updateStep(prev.id, {
    status: "active",
    completedAt: undefined,
    startedAt: prev.startedAt ?? new Date().toISOString(),
  });
  return { active };
}

export async function pauseRun(db: Db, runId: Id): Promise<Run> {
  assertEnabled("liveBench");
  return db.updateRun(runId, { status: "paused" });
}
export async function resumeRun(db: Db, runId: Id): Promise<Run> {
  assertEnabled("liveBench");
  return db.updateRun(runId, { status: "active" });
}
export async function completeRun(db: Db, runId: Id): Promise<Run> {
  assertEnabled("liveBench");
  return db.updateRun(runId, { status: "completed", endedAt: new Date().toISOString() });
}
export async function abortRun(db: Db, runId: Id): Promise<Run> {
  assertEnabled("liveBench");
  return db.updateRun(runId, { status: "aborted", endedAt: new Date().toISOString() });
}

export async function listRuns(db: Db, ws: Ws, opts?: { status?: Run["status"] }): Promise<Run[]> {
  assertEnabled("liveBench");
  return db.listRuns(ws, opts);
}

/** Une ligne du tableau de bord : le run + le titre du protocole figé +
 *  la progression (étapes terminées ou passées / total). Les runs sont
 *  renvoyés du plus récent au plus ancien. */
export interface RunOverview {
  run: Run;
  protocolTitle: string;
  stepsDone: number;
  stepsTotal: number;
}

export async function listRunsOverview(
  db: Db,
  ws: Ws,
  opts?: { status?: Run["status"] }
): Promise<RunOverview[]> {
  assertEnabled("liveBench");
  const runs = await db.listRuns(ws, opts);
  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const out: RunOverview[] = [];
  for (const run of runs) {
    const [protocol, steps] = await Promise.all([
      getProtocol(db, run.protocolId, run.protocolVersion),
      db.listSteps(run.id),
    ]);
    const stepsDone = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    out.push({
      run,
      protocolTitle: protocol?.title ?? "Protocol",
      stepsDone,
      stepsTotal: steps.length,
    });
  }
  return out;
}

export async function getRunState(db: Db, runId: Id): Promise<RunState | null> {
  assertEnabled("liveBench");
  const run = await db.getRun(runId);
  if (!run) return null;
  const steps = await db.listSteps(runId);
  return { run, steps };
}

/** Contexte riche pour le Voice Copilot et l'Auto Report (protocole + scaling). */
export async function getRunContext(db: Db, runId: Id): Promise<RunContext | null> {
  assertEnabled("liveBench");
  const run = await db.getRun(runId);
  if (!run) return null;
  const steps = await db.listSteps(runId);
  const protocol = await getProtocol(db, run.protocolId, run.protocolVersion);
  if (!protocol) throw new Error(`Protocole figé introuvable : ${run.protocolId}@v${run.protocolVersion}`);
  const n = run.scalingContext.n_reactions ?? 6;
  const overage = run.scalingContext.overage_pct ?? 10;
  const scaledRecipe = protocol.recipe ? scaleMasterMix(protocol.recipe, n, overage) : null;
  const currentStep = steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "pending") ?? null;
  return { run, steps, protocol, scaledRecipe, currentStep };
}

function scaledComponentsToParams(scaled: ResolvedRecipe): Record<string, Quantity> {
  const out: Record<string, Quantity> = {};
  for (const c of scaled.components) out[c.name] = c.total;
  out["Total mix partagé"] = scaled.sharedTotal;
  return out;
}

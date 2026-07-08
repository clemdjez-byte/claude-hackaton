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
} from "@/lib/core";
import { getProtocol } from "@/features/protocol-studio";

export interface StartRunInput {
  operator: Id;
  protocolId: Id;
  protocolVersion?: number; // défaut : dernière version publiée/éditée
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

// lib/live-experiment/index.ts — surface publique de la brique Live Experiment.
// Les coutures Sylvy (adapters.sylvy, bridge.sylvy, routes, UI) importent d'ICI ;
// le cœur (core/ + features/) n'importe jamais rien de Sylvy (@/lib/*).

// Socle : types, calcul déterministe, interrupteurs internes.
export * from "./core/types";
export { round, convert, scaleMasterMix, dilution } from "./core/calc";
export { FLAGS, isEnabled, assertEnabled, FeatureDisabledError } from "./core/flags";
export type { FeatureKey } from "./core/flags";

// Persistance : le type Db (interface) + helper d'id. Les implémentations
// (SQLite / Supabase) vivent dans les adaptateurs, jamais réexportées ici.
export { shortId } from "./core/db";
export type {
  Db,
  NewPage,
  NewFichier,
  NewRun,
  NewStep,
  NewEvidence,
  NewEmbedding,
  NewEdge,
} from "./core/db";

// Ports (contrats des adaptateurs).
export type {
  LiveExperimentStore,
  LiveExperimentLlm,
  LiveExperimentMemory,
  LiveExperimentMemoryHit,
  LiveExperimentDeps,
  LlmTask,
} from "./ports";

// ── APIs des briques (pour les coutures Sylvy : actions, routes, UI) ─────
// Les coutures importent d'ICI, jamais en deep-import. N'expose PAS les
// adaptateurs (adapters.standalone tire better-sqlite3 → bundle serverless).
export {
  listProtocols,
  getProtocol,
  createProtocol,
  updateProtocol,
  publishProtocol,
  sealDraft,
  adaptProtocol,
  generateProtocol,
  generateProtocolFromDocument,
  seedReferenceProtocol,
  previewScaledRecipe,
  RT_QPCR_REFERENCE,
} from "./features/protocol-studio";
export {
  startRun,
  getRunContext,
  getRunState,
  listRuns,
  listRunsOverview,
  advanceStep,
  skipStep,
  stepBack,
  pauseRun,
  resumeRun,
  completeRun,
  abortRun,
} from "./features/live-bench";
export type { StartRunInput, RunState, RunContext, RunOverview } from "./features/live-bench";
export {
  captureNote,
  captureMeasurement,
  captureDeviation,
  capturePhotoRef,
  captureDataFile,
  deleteEvidence,
  listEvidence,
} from "./features/evidence-capture";
export { generateReport, getReport, exportReportMarkdown } from "./features/auto-report";
export { handleVoiceCommand, streamVoiceCommand } from "./features/voice-copilot";
export type { VoiceLang } from "./features/voice-copilot";

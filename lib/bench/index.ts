// lib/bench/index.ts — logique métier du bench (protocoles, runs, preuves,
// rapports, voix). Les coutures hôte (actions, routes, UI) importent d'ICI.

// Protocol Studio.
export {
  listProtocols,
  getProtocol,
  createProtocol,
  updateProtocol,
  publishProtocol,
  setProtocolArchived,
  sealDraft,
  adaptProtocol,
  generateProtocol,
  generateProtocolFromDocument,
  seedReferenceProtocol,
  previewScaledRecipe,
  RT_QPCR_REFERENCE,
} from "./protocol-studio";
export type { ProtocolDraft } from "./protocol-studio";

// Live Bench (console de run).
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
} from "./live-bench";
export type { StartRunInput, RunState, RunContext, RunOverview } from "./live-bench";

// Evidence Capture.
export {
  captureNote,
  captureMeasurement,
  captureDeviation,
  capturePhoto,
  capturePhotoRef,
  captureDataFile,
  deleteEvidence,
  listEvidence,
} from "./evidence-capture";

// Auto Report.
export { generateReport, getReport, exportReportMarkdown } from "./auto-report";

// Voice Copilot.
export { handleVoiceCommand, streamVoiceCommand, buildSystemPrompt } from "./voice-copilot";
export type { VoiceLang } from "./voice-copilot";

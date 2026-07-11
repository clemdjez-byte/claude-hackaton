// lib/live-experiment/core/index.ts — barrel INTERNE du socle. Les briques
// (features/*) importent d'ici (`../../core`). N'expose PAS createDb/getDb :
// les implémentations de store vivent dans les adaptateurs, pour que le cœur ne
// tire jamais `better-sqlite3` dans le bundle serverless de Sylvy (plan §9.3).

export * from "./types";
export { round, convert, scaleMasterMix, dilution } from "./calc";
export { FLAGS, isEnabled, assertEnabled, FeatureDisabledError } from "./flags";
export type { FeatureKey } from "./flags";
export { shortId } from "./db";
export type {
  Db,
  NewPage,
  NewFichier,
  NewRun,
  NewStep,
  NewEvidence,
  NewEmbedding,
  NewEdge,
} from "./db";
export {
  MODELS,
  modelFor,
  hasLlmKey,
  generateObjectFor,
  generateProse,
  configureLiveExperimentLlm,
  EMBED_DIM,
  embed,
  cosine,
} from "./llm";
export type { LlmTask } from "./llm";

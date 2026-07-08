// lib/core/index.ts — surface publique du socle. Les briques importent d'ici.
export * from "./types";
export { round, convert, scaleMasterMix, dilution } from "./calc";
export { FLAGS, isEnabled, assertEnabled, FeatureDisabledError } from "./flags";
export type { FeatureKey } from "./flags";
export { createDb, getDb, shortId } from "./db";
export type { Db } from "./db";
export {
  MODELS,
  modelFor,
  hasLlmKey,
  generateObjectFor,
  generateProse,
  embed,
  cosine,
} from "./llm";
export type { LlmTask } from "./llm";

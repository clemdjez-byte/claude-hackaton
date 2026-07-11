// lib/core/index.ts — surface publique de l'infra : types, calcul déterministe,
// interrupteurs, persistance (SQLite), couche LLM. Le reste du code (lib/bench,
// lib/retrieval, les routes/actions hôte) importe d'ici.

// Types partagés.
export * from "./types";

// Calcul déterministe.
export { round, convert, scaleMasterMix, dilution } from "./calc";

// Interrupteurs internes.
export { FLAGS, isEnabled, assertEnabled, FeatureDisabledError } from "./flags";
export type { FeatureKey } from "./flags";

// Persistance : l'interface Db + helper d'id + types New*, et l'implémentation
// SQLite par défaut (createDb / getDb).
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
export { createDb, getDb } from "./sqlite";

// Couche LLM.
export {
  modelFor,
  hasLlmKey,
  generateObjectFor,
  generateProse,
  configureLlm,
} from "./llm";
export type { LlmTask } from "./llm";

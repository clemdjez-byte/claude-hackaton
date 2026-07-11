// lib/live-experiment/ports.ts — les PORTS de la brique Live Experiment.
// Calqué sur lib/report-generator/ports.ts : le cœur (core/ + features/) ne dépend
// QUE de ces interfaces — ni Supabase, ni Next, ni SDK fournisseur. Deux jeux
// d'adaptateurs les implémentent :
//   - adapters.standalone.ts → SQLite + SDK Anthropic direct (défaut OSS + tests)
//   - adapters.sylvy.ts      → Supabase + couche lib/llm (Claude forcé)
// C'est cette frontière qui rend la brique à la fois débrayable et détachable.

import type { LanguageModel } from "ai";
import type { z } from "zod";
import type { Db } from "./core/db";
import type { MemorySourceType } from "./core/types";

/** Port de persistance : l'interface Db d'Octopus, verbatim. */
export type LiveExperimentStore = Db;

/** Tâches LLM de la brique → un modèle par tâche (voir adapters pour le mapping). */
export type LlmTask = "voice" | "protocol" | "report";

/** Port LLM : les briques appellent ces méthodes, jamais un SDK en direct. */
export interface LiveExperimentLlm {
  hasLlmKey(): boolean;
  /** Modèle brut pour la boucle outillée (generateText + tools + stopWhen). */
  modelFor(task: LlmTask): LanguageModel;
  /** Objet validé par un schéma Zod (jamais de JSON parsé à la main). */
  generateObjectFor<T>(
    task: LlmTask,
    args: { system: string; prompt: string; schema: z.ZodType<T> }
  ): Promise<T>;
  /** Prose (rapport, explication) — ne fabrique aucun chiffre. */
  generateProse(task: LlmTask, args: { system: string; prompt: string }): Promise<string>;
}

export interface LiveExperimentMemoryHit {
  sourceId: string;
  sourceType: MemorySourceType;
  text: string;
  score: number;
}

/** Port mémoire optionnel. En standalone : la brique lab-memory (embeddings dim256
 *  dans le store). En Sylvy : délégué à la vraie couche mémoire (pgvector 1536). */
export interface LiveExperimentMemory {
  index(entry: {
    ws: string;
    sourceType: MemorySourceType;
    sourceId: string;
    text: string;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  search(ws: string, query: string, k: number): Promise<LiveExperimentMemoryHit[]>;
}

/** Ce que le point d'entrée d'un run doit fournir aux briques. */
export interface LiveExperimentDeps {
  store: LiveExperimentStore;
  llm: LiveExperimentLlm;
  memory?: LiveExperimentMemory;
}

// lib/live-experiment/core/llm.ts — LA couche LLM unique. Les briques ne parlent
// JAMAIS à un SDK fournisseur en direct : elles passent par ici. Adapté d'Octopus
// pour être CONFIGURABLE : un provider par défaut (SDK Anthropic direct = comportement
// Octopus, pour le standalone/OSS) et un seam `configureLiveExperimentLlm(provider)`
// que l'adaptateur Sylvy utilise pour forcer Claude via lib/llm. Changer de modèle
// ou de fournisseur = un seul point d'injection.
//
// Routage par défaut (tâche → modèle Claude) :
//   voice    → Haiku 4.5  (latence : pilotage vocal temps réel)
//   protocol → Sonnet     (génération structurée)
//   report   → Opus 4.8   (synthèse long-format)

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import type { LiveExperimentLlm, LlmTask } from "../ports";

export type { LlmTask } from "../ports";

export const MODELS: Record<LlmTask, string> = {
  voice: "claude-haiku-4-5-20251001",
  protocol: "claude-sonnet-5",
  report: "claude-opus-4-8",
};

// Provider par défaut : SDK Anthropic en direct (comportement Octopus standalone).
function defaultProvider(): LiveExperimentLlm {
  const has = () => !!process.env.ANTHROPIC_API_KEY;
  const requireKey = () => {
    if (!has())
      throw new Error("ANTHROPIC_API_KEY absente : la couche LLM ne peut pas répondre.");
  };
  return {
    hasLlmKey: has,
    modelFor: (task) => anthropic(MODELS[task]),
    async generateObjectFor(task, args) {
      requireKey();
      const { object } = await generateObject({
        model: anthropic(MODELS[task]),
        system: args.system,
        prompt: args.prompt,
        schema: args.schema,
      });
      return object;
    },
    async generateProse(task, args) {
      requireKey();
      const { text } = await generateText({
        model: anthropic(MODELS[task]),
        system: args.system,
        prompt: args.prompt,
      });
      return text;
    },
  };
}

let PROVIDER: LiveExperimentLlm | null = null;

/** Remplace le provider LLM (l'adaptateur Sylvy injecte ici Claude via lib/llm).
 *  Passer `null` restaure le provider par défaut (SDK direct). */
export function configureLiveExperimentLlm(p: LiveExperimentLlm | null): void {
  PROVIDER = p;
}

function provider(): LiveExperimentLlm {
  return (PROVIDER ??= defaultProvider());
}

// Surface appelée par les briques — délègue toujours au provider courant.
export const modelFor = (task: LlmTask) => provider().modelFor(task);
export const hasLlmKey = () => provider().hasLlmKey();
export function generateObjectFor<T>(
  task: LlmTask,
  args: { system: string; prompt: string; schema: z.ZodType<T> }
): Promise<T> {
  return provider().generateObjectFor<T>(task, args);
}
export const generateProse = (task: LlmTask, args: { system: string; prompt: string }) =>
  provider().generateProse(task, args);

// ── Embeddings ─────────────────────────────────────────────────────────
// Embedder local dim256 (module pur). Utilisé par la brique lab-memory en
// standalone ; en Sylvy la mémoire passe par le port dédié (pgvector 1536).
export { EMBED_DIM, embed, cosine } from "./embed";

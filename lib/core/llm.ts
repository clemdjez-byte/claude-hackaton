// lib/core/llm.ts — LA couche LLM unique. Les briques ne parlent JAMAIS à un
// SDK fournisseur en direct : elles passent par ici. CONFIGURABLE : un provider
// par défaut (SDK Anthropic direct) et un seam `configureLlm(provider)` pour en
// injecter un autre. Changer de modèle ou de fournisseur = un seul point d'injection.
//
// Routage par défaut (tâche → modèle Claude) :
//   voice    → Haiku 4.5  (latence : pilotage vocal temps réel)
//   protocol → Sonnet     (génération structurée)
//   report   → Opus 4.8   (synthèse long-format)

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import type { LlmProvider, LlmTask } from "./types";

export type { LlmTask } from "./types";

export const MODELS: Record<LlmTask, string> = {
  voice: "claude-haiku-4-5-20251001",
  protocol: "claude-sonnet-5",
  report: "claude-opus-4-8",
};

// Provider par défaut : SDK Anthropic en direct.
function defaultProvider(): LlmProvider {
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

let PROVIDER: LlmProvider | null = null;

/** Remplace le provider LLM (un hôte peut injecter un autre fournisseur ici).
 *  Passer `null` restaure le provider par défaut (SDK direct). */
export function configureLlm(p: LlmProvider | null): void {
  PROVIDER = p;
}

function provider(): LlmProvider {
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

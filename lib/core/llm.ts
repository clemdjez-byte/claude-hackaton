// lib/core/llm.ts — LA couche LLM unique. Les briques ne parlent JAMAIS à un
// SDK fournisseur en direct : elles passent par ici. Changer de modèle = config.
//
// Routage (tâche → modèle Claude) :
//   voice    → Haiku 4.5  (latence : pilotage vocal temps réel)
//   protocol → Sonnet 5   (génération structurée)
//   report   → Opus 4.8   (synthèse long-format)

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import type { z } from "zod";

export type LlmTask = "voice" | "protocol" | "report";

export const MODELS: Record<LlmTask, string> = {
  voice: "claude-haiku-4-5-20251001",
  protocol: "claude-sonnet-5",
  report: "claude-opus-4-8",
};

export function modelFor(task: LlmTask) {
  return anthropic(MODELS[task]);
}

export function hasLlmKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
function requireKey() {
  if (!hasLlmKey())
    throw new Error("ANTHROPIC_API_KEY absente : la couche LLM ne peut pas répondre.");
}

/** Génère un objet validé par un schéma Zod (jamais de JSON à parser à la main). */
export async function generateObjectFor<T>(
  task: LlmTask,
  args: { system: string; prompt: string; schema: z.ZodType<T> }
): Promise<T> {
  requireKey();
  const { object } = await generateObject({
    model: modelFor(task),
    system: args.system,
    prompt: args.prompt,
    schema: args.schema,
  });
  return object;
}

/** Génère de la prose (rapport, explication). Ne fabrique aucun chiffre. */
export async function generateProse(
  task: LlmTask,
  args: { system: string; prompt: string }
): Promise<string> {
  requireKey();
  const { text } = await generateText({
    model: modelFor(task),
    system: args.system,
    prompt: args.prompt,
  });
  return text;
}

// ── Embeddings ─────────────────────────────────────────────────────────
// L'embedder vit dans './embed' (module pur, sans dépendance) pour être
// partagé avec le serveur MCP. Ré-exporté ici pour la surface de la couche LLM.
export { EMBED_DIM, embed, cosine } from "./embed";

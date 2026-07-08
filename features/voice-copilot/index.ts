// features/voice-copilot/index.ts — Brique 7.
// Responsabilité unique : mains-libres. Transcript → intent → action déléguée.
// Orchestrateur fin : zéro logique métier propre, il branche l'agent Claude sur
// les outils des autres briques. L'état du run est reconstruit dans le system
// prompt à chaque tour (le pattern le plus simple et fiable).
import {
  assertEnabled,
  modelFor,
  hasLlmKey,
  type Db,
  type Id,
  type Ws,
} from "@/lib/core";
import { generateText, stepCountIs } from "ai";
import { getRunContext, type RunContext } from "@/features/live-bench";
import { buildVoiceTools } from "./tools";

export { buildVoiceTools } from "./tools";
export type { VoiceToolCtx, VoiceTools } from "./tools";

/** Reconstruit l'état du run + le protocole pour Claude, à chaque tour. */
export function buildSystemPrompt(ctx: RunContext): string {
  const steps = ctx.steps
    .map((s) => {
      const proto = ctx.protocol.steps.find((p) => p.index === s.protocolStepIndex);
      const crit = proto?.critical ? " [CRITIQUE]" : "";
      const marker = s.status === "active" ? "→ " : "  ";
      return `${marker}${s.protocolStepIndex}. ${s.title} (${s.status})${crit}`;
    })
    .join("\n");

  const current = ctx.currentStep
    ? ctx.protocol.steps.find((p) => p.index === ctx.currentStep!.protocolStepIndex)
    : undefined;

  const recipe = ctx.scaledRecipe
    ? ctx.scaledRecipe.components
        .filter((c) => c.shared)
        .map((c) => `  · ${c.name} : ${c.total.value} ${c.total.unit}`)
        .join("\n") +
      `\n  · Total mix partagé : ${ctx.scaledRecipe.sharedTotal.value} ${ctx.scaledRecipe.sharedTotal.unit}`
    : "n/a";

  return `Tu es Octopus, copilote vocal d'expérience au bench. Tu pilotes CE run à la voix.
Voix Sylvy : calme, précise, en français, une à deux phrases courtes (l'utilisateur a les mains prises). JAMAIS d'emoji, pas de point d'exclamation superflu. Utilise les OUTILS pour agir plutôt que de décrire.

RÈGLES DE RIGUEUR :
- Base-toi UNIQUEMENT sur l'état ci-dessous et le protocole. Si l'info n'y est pas, dis-le.
- Ne calcule JAMAIS un volume toi-même : les volumes du master mix sont déjà calculés (ci-dessous).
- Si l'utilisateur rapporte un écart au protocole : d'abord dis en UNE phrase si c'est critique ou non ET le mécanisme (ex. « critique : à 55 °C le SYBR marque des amorçages non-spécifiques et des primer-dimers, visibles en melt curve »), puis appelle flag_deviation avec la bonne sévérité. Appuie-toi sur les étapes marquées [CRITIQUE].

PROTOCOLE : ${ctx.protocol.title} (v${ctx.protocol.version})
ÉTAPE COURANTE : ${current ? `${current.index}. ${current.title} — ${current.instruction}` : "aucune"}

TOUTES LES ÉTAPES :
${steps}

MASTER MIX (calculé, ${ctx.run.scalingContext.n_reactions ?? "?"} réactions, excès ${ctx.run.scalingContext.overage_pct ?? "?"} %) :
${recipe}

STATUT DU RUN : ${ctx.run.status}`;
}

export interface VoiceTimer {
  label: string;
  seconds: number;
}
export interface VoiceReply {
  reply: string;
  timers: VoiceTimer[]; // minuteurs à lancer côté navigateur
  didAct: boolean; // un outil a modifié l'état → le client rafraîchit le run
}

/** Un tour de l'agent vocal : transcript → réponse + effets (JSON, pas de flux). */
export async function handleVoiceCommand(
  db: Db,
  ws: Ws,
  runId: Id,
  operator: Id,
  transcript: string
): Promise<VoiceReply> {
  assertEnabled("voiceCopilot");
  if (!hasLlmKey()) throw new Error("ANTHROPIC_API_KEY absente : le copilote vocal est indisponible.");
  const ctx = await getRunContext(db, runId);
  if (!ctx) throw new Error(`Run introuvable : ${runId}`);
  const result = await generateText({
    model: modelFor("voice"),
    system: buildSystemPrompt(ctx),
    prompt: transcript,
    tools: buildVoiceTools({ db, ws, runId, operator }),
    stopWhen: stepCountIs(6),
  });

  const timers: VoiceTimer[] = [];
  let didAct = false;
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      didAct = true;
      if (call.toolName === "start_timer") {
        const input = call.input as { label: string; seconds: number };
        timers.push({ label: input.label, seconds: input.seconds });
      }
    }
  }
  return { reply: result.text, timers, didAct };
}

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
} from "../../core";
import { generateText, streamText, stepCountIs } from "ai";
import { getRunContext, type RunContext } from "../live-bench";
import { buildVoiceTools } from "./tools";

/** Langue de la boucle vocale : consigne du prompt + (côté client) reco et TTS. */
export type VoiceLang = "fr" | "en";

export { buildVoiceTools } from "./tools";
export type { VoiceToolCtx, VoiceTools } from "./tools";

/** Reconstruit l'état du run + le protocole pour Claude, à chaque tour. */
export function buildSystemPrompt(ctx: RunContext, lang: VoiceLang = "fr"): string {
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

  const voiceLine =
    lang === "en"
      ? "Sylvy voice: calm, precise, in English, one or two short sentences (the user's hands are busy). NEVER any emoji, no superfluous exclamation marks. Use the TOOLS to act rather than describe."
      : "Voix Sylvy : calme, précise, en français, une à deux phrases courtes (l'utilisateur a les mains prises). JAMAIS d'emoji, pas de point d'exclamation superflu. Utilise les OUTILS pour agir plutôt que de décrire.";

  return `Tu es Octopus, copilote vocal d'expérience au bench. Tu pilotes CE run à la voix.
${voiceLine}

TU PILOTES TOUT À LA VOIX (utilise l'outil correspondant) :
- Avancer l'étape (next_step), sauter une étape (skip_step), revenir en arrière (step_back).
- Consigner une preuve : note (add_note), mesure chiffrée (record_measurement), déviation (flag_deviation).
- Prendre une photo à la webcam (capture_photo), couper la webcam (close_camera), lancer un minuteur (start_timer), fouiller la mémoire du labo (query_memory).

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
  capturePhoto: boolean; // l'agent demande une capture webcam → le client déclenche
  closeCamera: boolean; // l'agent demande de couper la webcam → le client l'éteint
  didAct: boolean; // un outil a modifié l'état → le client rafraîchit le run
}

/** Prépare un tour vocal : garde-fous + modèle + system prompt + outils.
 *  Partagé par handleVoiceCommand (non-streaming, OSS) et streamVoiceCommand. */
async function prepareVoiceTurn(
  db: Db,
  ws: Ws,
  runId: Id,
  operator: Id,
  lang: VoiceLang
) {
  assertEnabled("voiceCopilot");
  if (!hasLlmKey()) throw new Error("ANTHROPIC_API_KEY absente : le copilote vocal est indisponible.");
  const ctx = await getRunContext(db, runId);
  if (!ctx) throw new Error(`Run introuvable : ${runId}`);
  return {
    model: modelFor("voice"),
    system: buildSystemPrompt(ctx, lang),
    tools: buildVoiceTools({ db, ws, runId, operator }),
  };
}

/** Un tour de l'agent vocal, réponse complète (JSON, pas de flux). Conservé pour
 *  l'OSS / les consommateurs non-streaming. La route Sylvy utilise streamVoiceCommand. */
export async function handleVoiceCommand(
  db: Db,
  ws: Ws,
  runId: Id,
  operator: Id,
  transcript: string,
  lang: VoiceLang = "fr"
): Promise<VoiceReply> {
  const { model, system, tools } = await prepareVoiceTurn(db, ws, runId, operator, lang);
  const result = await generateText({ model, system, prompt: transcript, tools, stopWhen: stepCountIs(6) });

  const timers: VoiceTimer[] = [];
  let capturePhoto = false;
  let closeCamera = false;
  let didAct = false;
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      didAct = true;
      if (call.toolName === "start_timer") {
        const input = call.input as { label: string; seconds: number };
        timers.push({ label: input.label, seconds: input.seconds });
      }
      if (call.toolName === "capture_photo") capturePhoto = true;
      if (call.toolName === "close_camera") closeCamera = true;
    }
  }
  return { reply: result.text, timers, capturePhoto, closeCamera, didAct };
}

/** Un tour de l'agent vocal, EN STREAMING. Retourne le résultat de streamText ;
 *  l'appelant (route) itère result.fullStream pour émettre texte + effets au fil
 *  de l'eau. Les outils s'exécutent automatiquement (execute côté serveur). */
export async function streamVoiceCommand(
  db: Db,
  ws: Ws,
  runId: Id,
  operator: Id,
  transcript: string,
  lang: VoiceLang = "fr"
) {
  const { model, system, tools } = await prepareVoiceTurn(db, ws, runId, operator, lang);
  return streamText({ model, system, prompt: transcript, tools, stopWhen: stepCountIs(6) });
}

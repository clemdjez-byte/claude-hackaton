// voice-agent/agent.ts — l'agent vocal du Bench. Rejoint la room LiveKit d'un
// run (bench-run-<runId>), écoute en continu (barge-in par VAD : on peut lui
// couper la parole), pilote la manip avec les MÊMES outils et le MÊME prompt
// que l'ancien copilote (lib/bench/voice-copilot, importé, jamais modifié),
// et écrit dans la même SQLite que le site (mode WAL).
// Lancement : `npm run voice` (livekit-server --dev + cet agent, cf. package.json).
import { fileURLToPath } from "node:url";
import {
  Agent,
  AgentSession,
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
} from "@livekit/agents";
import * as anthropic from "@livekit/agents-plugin-anthropic";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as silero from "@livekit/agents-plugin-silero";
import { buildSystemPrompt, getRunContext } from "@/lib/bench";
import { OPERATOR, WS, getBenchSession } from "@/lib/session";
import { buildAgentTools, type ClientEvent } from "./tools";

const ROOM_PREFIX = "bench-run-";
// Même modèle que MODELS.voice de lib/core/llm.ts (non exporté) : Haiku, latence.
const VOICE_MODEL = "claude-haiku-4-5-20251001";

// Fail-fast : sans ces clés le pipeline est muet/sourd — on refuse de démarrer
// avec un message actionnable plutôt que d'échouer en pleine conversation.
for (const key of ["ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "CARTESIA_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`[voice-agent] ${key} manquante — renseigne-la dans .env.local (voir .env.example).`);
    process.exit(1);
  }
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? "";
    if (!roomName.startsWith(ROOM_PREFIX)) return; // pas une room du Bench
    const runId = roomName.slice(ROOM_PREFIX.length);

    const { store } = getBenchSession();
    const runContext = await getRunContext(store, runId);
    if (!runContext) {
      console.error(`[voice-agent] run introuvable : ${runId}`);
      return;
    }

    // Relaye un ordre au(x) navigateur(s) de la room. Un échec RPC (page en
    // cours de rechargement) ne doit pas faire tomber le tour de parole.
    const sendClientEvent = async (ev: ClientEvent) => {
      const payload = JSON.stringify(ev);
      for (const p of ctx.room.remoteParticipants.values()) {
        await ctx.room.localParticipant
          ?.performRpc({
            destinationIdentity: p.identity,
            method: "bench.client_event",
            payload,
            responseTimeout: 10_000,
          })
          .catch((e: unknown) => console.warn(`[voice-agent] RPC vers ${p.identity} :`, e));
      }
    };

    const agent = Agent.create({
      instructions: buildSystemPrompt(runContext),
      tools: buildAgentTools(
        { db: store, ws: WS, runId, operator: OPERATOR },
        {
          sendClientEvent,
          // Après un outil mutateur : l'agent voit l'état à jour, l'UI aussi.
          onMutation: async () => {
            const fresh = await getRunContext(store, runId);
            if (fresh) await agent.updateInstructions(buildSystemPrompt(fresh));
            await sendClientEvent({ type: "did_act" });
          },
        }
      ),
    });

    const session = new AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      // nova-3 multilingue : gère le français, l'anglais et le code-switching.
      stt: new deepgram.STT({ model: "nova-3", language: "multi" }),
      llm: new anthropic.LLM({ model: VOICE_MODEL }),
      tts: new cartesia.TTS({
        model: "sonic-3",
        language: "fr",
        ...(process.env.CARTESIA_VOICE_ID ? { voice: process.env.CARTESIA_VOICE_ID } : {}),
      }),
      // VAD pur : 100 % local (le détecteur sémantique passe par LiveKit Cloud).
      turnDetection: "vad",
    });

    await session.start({ agent, room: ctx.room });
    session.say("Copilote prêt.");
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    wsURL: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret",
  })
);

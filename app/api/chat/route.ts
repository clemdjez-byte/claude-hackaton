// Route hôte : chat « Ask your lab », RAG limité au lab courant (Bench). Pas
// de persistance de threads (YAGNI démo) : l'historique voyage dans le corps
// de la requête, porté par le client. La clé Claude reste côté serveur. Même
// pattern NDJSON que la voix (voir app/api/live-experiment/voice/route.ts),
// avec un vocabulaire d'événements dédié (text_chunk/sources/done/error).
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage } from "ai";
import { search } from "@/lib/live-experiment/features/lab-memory";
import type { MemoryHit } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_HIT_CHARS = 800;
const HIT_COUNT = 8;

type ChatMessage = { role: "user" | "assistant"; content: string };

function isChatMessage(m: unknown): m is ChatMessage {
  const r = m as Partial<ChatMessage> | null;
  return (
    !!r &&
    (r.role === "user" || r.role === "assistant") &&
    typeof r.content === "string"
  );
}

/** Bloc contexte : une ligne « [type:id] texte » par hit, tronquée. */
function buildSystemPrompt(hits: MemoryHit[]): string {
  const context = hits.length
    ? hits
        .map((h) => `[${h.sourceType}:${h.sourceId}] ${h.text.slice(0, MAX_HIT_CHARS)}`)
        .join("\n\n")
    : "(No relevant lab memory found for this question.)";

  return `You are the Octopus lab copilot for Bench, the wet-lab notebook. You answer questions about THIS lab's work using ONLY the context below (protocols, runs, evidence, and reports retrieved from its memory).

Rules:
- Answer strictly from the context. Never invent facts, results, or numbers that are not in it.
- Cite every claim you make with the exact source tag from the context, in the form [type:id] (e.g. [run:abc123]).
- Distinguish clearly between a raw observation, a protocol instruction, a measurement, and your own inference — say which is which.
- If the context does not contain the answer, say so plainly instead of guessing.

CONTEXT:
${context}`;
}

export async function POST(req: Request) {
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.filter(isChatMessage) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content.trim()) {
    return Response.json({ error: "messages must include at least one user message." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error(
            "ANTHROPIC_API_KEY is not set on the server — add it to .env.local and restart to enable the chat."
          );
        }

        const { store } = getBenchSession();
        const hits = await search(store, WS, lastUser.content.trim(), HIT_COUNT);
        send({
          type: "sources",
          hits: hits.map((h) => ({
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            score: h.score,
            meta: h.meta,
          })),
        });

        const result = streamText({
          model: anthropic("claude-sonnet-5"),
          system: buildSystemPrompt(hits),
          messages: messages.map((m): ModelMessage => ({ role: m.role, content: m.content })),
        });
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            send({ type: "text_chunk", delta: part.text });
          } else if (part.type === "error") {
            // AI SDK v7 : les erreurs de flux (rate limit, surcharge, réseau)
            // arrivent comme un chunk, pas comme une exception d'itération.
            throw part.error;
          }
        }
        send({ type: "done" });
        controller.close();
      } catch (e) {
        try {
          send({ type: "error", message: e instanceof Error ? e.message : "Chat error." });
        } catch {
          /* client déconnecté : le flux est déjà mort */
        }
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

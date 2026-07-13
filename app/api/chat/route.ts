// Route hôte : chat « Ask your lab », RAG limité au lab courant (Bench). Pas
// de persistance de threads (YAGNI démo) : l'historique voyage dans le corps
// de la requête, porté par le client. La clé Claude reste côté serveur. Même
// pattern NDJSON que la voix (voir app/api/bench/voice/route.ts),
// avec un vocabulaire d'événements dédié (text_chunk/sources/done/error).
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { search } from "@/lib/retrieval";
import type { MemoryHit } from "@/lib/core";
import { getBenchSession, WS } from "@/lib/session";
import { collectGraphFacts, renderGraphFacts, collectGenericFacts, renderGenericFacts, loadLabels } from "@/lib/retrieval/knowledge-graph/query";
import { NODE, type KgNode } from "@/lib/retrieval/knowledge-graph/ontology";
import { buildChatTools } from "@/lib/chat/tools";
import { deriveSourceLabel } from "@/app/chat/sourceLabel";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_HIT_CHARS = 1200; // chaque hit est désormais un chunk déjà borné
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

/** Mappe les hits du RAG (mémoire) en nœuds d'ancrage du graphe. Runs et
 *  protocoles sont des ancres directes ; un hit rapport/preuve est rattaché à
 *  SON run (via meta.runId), pour élargir les points d'entrée de traversée. Les
 *  ancres run/protocole suffisent : les nœuds ouverts (instrument, opérateur…)
 *  y sont reliés par l'indexation (voir resolve.ts), donc atteignables en BFS. */
export function hitsToAnchors(
  hits: Array<{ sourceType: string; sourceId: string; meta?: Record<string, unknown> }>
): KgNode[] {
  const anchors: KgNode[] = [];
  const seen = new Set<string>();
  const add = (node: KgNode) => {
    const k = `${node.type}:${node.id}`;
    if (!seen.has(k)) { seen.add(k); anchors.push(node); }
  };
  for (const h of hits) {
    if (h.sourceType === "run") add(NODE.run(h.sourceId));
    else if (h.sourceType === "protocol") add(NODE.protocol(h.sourceId));
    else if ((h.sourceType === "report" || h.sourceType === "evidence") && typeof h.meta?.runId === "string") {
      add(NODE.run(h.meta.runId as string));
    }
  }
  return anchors;
}

/** Bloc contexte : une ligne « [type:id] texte » par hit, tronquée. */
function buildSystemPrompt(hits: MemoryHit[], graphBlock: string): string {
  const context = hits.length
    ? hits.map((h) => `[${h.sourceType}:${h.sourceId}] ${h.text.slice(0, MAX_HIT_CHARS)}`).join("\n\n")
    : "(No relevant lab memory found for this question.)";

  return `You are the Octopus lab copilot for Bench, the wet-lab notebook. You answer questions about THIS lab's work using ONLY the context below.

You are given TWO context blocks (already retrieved for this question):
- GRAPH FACTS: structured facts derived from this lab's runs. Two kinds: (1) quantitative lines (parameters, verdicts, documented failure modes with thresholds) — prefer these for any quantitative or aggregate claim (e.g. "3 of 4 failures violated a documented threshold"); (2) open triples of the form [type:id] "label" —relation→ [type:id] extracted from lab notes (e.g. which instrument, operator, sample or date a run involved). Use the triples for factual "which/who/what" questions.
- TEXT EXCERPTS: free-text chunks retrieved from lab memory (protocols, runs, evidence, reports).

You ALSO have TOOLS to look further when the two blocks are not enough. Prefer the pre-loaded blocks for simple questions (they are already here). Reach for a tool when you must:
- search_memory — find passages beyond the ones pre-loaded, or locate an id.
- read_report — read a run's FULL report (the excerpts are only 1200-char snippets).
- list_protocols / list_runs — enumerate protocols, or runs by verdict (e.g. "the failed runs").
- traverse_graph — follow the knowledge graph outward from an entity for structural "which/what/who" questions (works even if the entity was not pre-loaded).
- scale_recipe — scale a protocol's master mix to N reactions. The volumes are computed by deterministic code: report them exactly, never recompute them yourself.

Rules:
- Answer strictly from the context blocks and from tool results. Never invent facts, results, or numbers.
- For every claim, cite the exact source tag in the form [type:id] (e.g. [run:abc123], [protocol:p1]).
- For quantitative or aggregate statements, rely on GRAPH FACTS (or tool results) and cite the runs involved.
- Distinguish a raw observation, a protocol instruction, a measurement, and your own inference — say which is which.
- If neither the blocks nor a tool answers the question, say so plainly instead of guessing.
- Never perform an autonomous external/literature search; only use the lab's own tools and citations.
- Be efficient: use a tool only when the pre-loaded context is insufficient, and prefer one well-aimed call over many. Once you have enough, STOP calling tools and write the answer. Always finish your turn with a written answer for the user.

GRAPH FACTS:
${graphBlock}

TEXT EXCERPTS:
${context}`;
}

/** Réduit la sortie d'un outil à ce qui est utile à l'UI : un compte pour les
 *  recherches/listes, et la recette COMPLÈTE pour scale_recipe (le client en fait
 *  un tableau de volumes exacts). Le texte intégral (rapport, passages) reste dans
 *  le contexte de l'agent, pas re-streamé au client. */
function summarizeToolResult(name: string, output: unknown): Record<string, unknown> {
  const o = (output ?? {}) as Record<string, unknown>;
  switch (name) {
    case "scale_recipe":
      return o; // { ok, protocolTitle, recipe } — le client rend le tableau.
    case "read_report":
      return { runId: o.runId, chars: typeof o.markdown === "string" ? o.markdown.length : 0 };
    case "traverse_graph":
      return { nodeCount: o.nodeCount ?? 0, edgeCount: o.edgeCount ?? 0 };
    case "search_memory":
      return { count: Array.isArray(o.results) ? o.results.length : 0 };
    case "list_protocols":
    case "list_runs":
      return { count: o.count ?? 0 };
    default:
      return {};
  }
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

        // Voie graphe : les hits servent d'ancres. Best-effort (ne bloque pas le chat).
        // Deux passes fusionnées : le noyau chiffré (verdicts/seuils/recoupements)
        // + les triplets ouverts (relations libres extraites du texte).
        let graphBlock = "(No graph facts for these entities.)";
        try {
          const anchors = hitsToAnchors(hits);
          const facts = await collectGraphFacts(store, WS, anchors);
          const generic = await collectGenericFacts(store, WS, anchors);
          const labels = await loadLabels(store, WS);
          const parts: string[] = [];
          if (facts.runs.length) parts.push(renderGraphFacts(facts));
          const genericStr = renderGenericFacts(generic, labels);
          if (genericStr) parts.push(genericStr);
          if (parts.length) graphBlock = parts.join("\n");
          // On envoie les triplets ouverts EUX-MÊMES (pas seulement leur nombre)
          // + les labels : le client dessine ainsi le sous-graphe mobilisé.
          send({ type: "graph", facts, triples: generic, labels: Object.fromEntries(labels) });
        } catch (e) {
          console.warn("[chat] collecte graphe échouée (best-effort) :", e);
        }

        send({
          type: "sources",
          hits: hits.map((h) => ({
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            score: h.score,
            meta: h.meta,
            label: deriveSourceLabel(h.text),
          })),
        });

        const result = streamText({
          model: anthropic("claude-sonnet-5"),
          system: buildSystemPrompt(hits, graphBlock),
          messages: messages.map((m): ModelMessage => ({ role: m.role, content: m.content })),
          // L'agent peut approfondir en appelant des outils (lecture seule).
          // stepCountIs borne le nombre de tours pour ne pas boucler.
          tools: buildChatTools({ db: store, ws: WS }),
          stopWhen: stepCountIs(6),
        });
        let producedText = false;
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            producedText = true;
            send({ type: "text_chunk", delta: part.text });
          } else if (part.type === "tool-call") {
            // Montre à l'UI que l'agent « travaille » (ligne 🔧 …).
            send({ type: "tool_call", name: part.toolName, args: part.input });
          } else if (part.type === "tool-result") {
            send({ type: "tool_result", name: part.toolName, data: summarizeToolResult(part.toolName, part.output) });
          } else if (part.type === "error") {
            // AI SDK v7 : les erreurs de flux (rate limit, surcharge, réseau)
            // arrivent comme un chunk, pas comme une exception d'itération.
            throw part.error;
          }
        }

        // Filet anti-réponse-vide : si l'agent a épuisé ses tours en appelant des
        // outils sans jamais rédiger, on force une synthèse finale SANS outils à
        // partir de tout ce qu'il a rassemblé. Une démo n'a jamais de bulle vide.
        if (!producedText) {
          const prior = (await result.response).messages;
          const synth = streamText({
            model: anthropic("claude-sonnet-5"),
            system:
              "You already gathered information via tools (shown in the conversation). Write the final answer for the user now, grounded in those results and citing sources as [type:id]. Do NOT call any tool.",
            messages: [
              ...messages.map((m): ModelMessage => ({ role: m.role, content: m.content })),
              ...(prior as ModelMessage[]),
            ],
          });
          for await (const part of synth.fullStream) {
            if (part.type === "text-delta") send({ type: "text_chunk", delta: part.text });
            else if (part.type === "error") throw part.error;
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

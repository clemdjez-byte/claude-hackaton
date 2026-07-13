// lib/chat/tools.ts — les « bras » du copilote de chat « Ask your lab ».
// Miroir en LECTURE SEULE de lib/bench/voice-copilot/tools.ts : le chat ne
// modifie JAMAIS le labo, il ne fait qu'observer (chercher, lire, traverser,
// calculer). Chaque outil délègue à une brique via son interface publique.
// L'agent (route.ts) les appelle de lui-même quand une question demande plus
// que le contexte RAG+KG pré-chargé.
import { tool } from "ai";
import { z } from "zod";
import type { Db, Ws } from "@/lib/core";
import { search } from "@/lib/retrieval";
import {
  listProtocols,
  getProtocol,
  previewScaledRecipe,
  exportReportMarkdown,
  listRunsOverview,
} from "@/lib/bench";
import { subgraph } from "@/lib/retrieval/knowledge-graph";
import { renderGenericFacts, loadLabels } from "@/lib/retrieval/knowledge-graph/query";

export interface ChatToolCtx {
  db: Db;
  ws: Ws;
}

const MAX_REPORT_CHARS = 12000; // un rapport AML fait ~2–4 Ko ; borne de sécurité.

/** Construit les outils lecture-seule du chat (closures sur db/ws). */
export function buildChatTools(ctx: ChatToolCtx) {
  return {
    search_memory: tool({
      description:
        "Search the lab's semantic memory (protocols, runs, evidence, reports) by meaning. Use it to find more context than what was pre-loaded, or to locate a run/protocol id before reading it in full.",
      inputSchema: z.object({
        query: z.string().describe("what to look for, in natural language"),
        k: z.number().int().min(1).max(8).default(5).describe("number of passages to return"),
      }),
      execute: async ({ query, k }) => {
        const hits = await search(ctx.db, ctx.ws, query, k);
        return {
          results: hits.map((h) => ({
            type: h.sourceType,
            id: h.sourceId,
            score: Math.round(h.score * 100) / 100,
            text: h.text.slice(0, 800),
            runId: typeof h.meta?.runId === "string" ? h.meta.runId : undefined,
          })),
        };
      },
    }),

    read_report: tool({
      description:
        "Read the FULL signed report of a run (Objective / Planned / Performed / Observed / Interpretation / Deviations). Use it when the pre-loaded excerpts are not enough — you get the whole document, not a 1200-char snippet. Get the runId from search_memory or list_runs first.",
      inputSchema: z.object({
        runId: z.string().describe("id of the run whose report to read"),
      }),
      execute: async ({ runId }) => {
        const markdown = await exportReportMarkdown(ctx.db, runId);
        const truncated = markdown.length > MAX_REPORT_CHARS;
        return {
          runId,
          markdown: truncated ? markdown.slice(0, MAX_REPORT_CHARS) + "\n…(truncated)" : markdown,
          truncated,
        };
      },
    }),

    list_protocols: tool({
      description: "List the lab's protocols (latest version of each): id, title, version, status.",
      inputSchema: z.object({}),
      execute: async () => {
        const protocols = await listProtocols(ctx.db, ctx.ws);
        return {
          count: protocols.length,
          protocols: protocols.map((p) => ({ id: p.id, title: p.title, version: p.version, status: p.status })),
        };
      },
    }),

    list_runs: tool({
      description:
        "List the lab's runs with their protocol, progress and scientific verdict (success / failure / partial). Filter by verdict to answer questions like « show me the failed runs ».",
      inputSchema: z.object({
        verdict: z
          .enum(["success", "failure", "partial"])
          .optional()
          .describe("keep only runs with this verdict (optional)"),
      }),
      execute: async ({ verdict }) => {
        const overview = await listRunsOverview(ctx.db, ctx.ws);
        const rows = await Promise.all(
          overview.map(async (o) => {
            const outcome = await ctx.db.getOutcomeByRun(o.run.id);
            return {
              runId: o.run.id,
              protocolTitle: o.protocolTitle,
              status: o.run.status,
              verdict: outcome?.verdict,
              reason: outcome?.reason,
              progress: `${o.stepsDone}/${o.stepsTotal}`,
            };
          })
        );
        const filtered = verdict ? rows.filter((r) => r.verdict === verdict) : rows;
        return { count: filtered.length, runs: filtered };
      },
    }),

    traverse_graph: tool({
      description:
        "Traverse the knowledge graph OUTWARD from one entity (a run, protocol, reagent, parameter_type, cell_line…) and return the typed relations around it. Use this for structural « which/what/who » questions (e.g. all protocols that use a reagent) — it does NOT depend on a prior semantic hit. Node ids come from citations [type:id], search_memory or list_* .",
      inputSchema: z.object({
        nodeType: z.string().describe("entity type, e.g. run, protocol, reagent, parameter_type, cell_line"),
        nodeId: z.string().describe("entity id (the part after the colon in a [type:id] tag)"),
        depth: z.number().int().min(1).max(3).default(2).describe("how many hops to explore"),
      }),
      execute: async ({ nodeType, nodeId, depth }) => {
        const { nodes, edges } = await subgraph(ctx.db, ctx.ws, { type: nodeType, id: nodeId }, depth);
        const labels = await loadLabels(ctx.db, ctx.ws);
        // Un hub très connecté peut renvoyer des centaines de relations : on borne
        // pour ne pas noyer l'agent (contexte + latence). Les plus proches d'abord.
        const CAP = 50;
        const capped = edges.slice(0, CAP);
        return {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          truncated: edges.length > CAP,
          // Même rendu lisible que le bloc GRAPH FACTS : « [type:id] "label" —relation→ [type:id] ».
          relations: renderGenericFacts(capped, labels),
        };
      },
    }),

    scale_recipe: tool({
      description:
        "Scale a protocol's master mix to N reactions. Volumes are computed by DETERMINISTIC code (never by you) — return them exactly as given. Use it whenever the user asks to prepare/scale a recipe for a number of reactions.",
      inputSchema: z.object({
        protocolId: z.string().describe("id of the protocol whose recipe to scale"),
        n: z.number().int().min(1).max(384).optional().describe("number of reactions (defaults to the protocol's own n_reactions)"),
      }),
      execute: async ({ protocolId, n }) => {
        const protocol = await getProtocol(ctx.db, protocolId);
        if (!protocol) return { ok: false as const, reason: `protocol not found: ${protocolId}` };
        const scaled = previewScaledRecipe(protocol, n);
        if (!scaled) return { ok: false as const, reason: "this protocol has no master-mix recipe to scale" };
        return { ok: true as const, protocolTitle: protocol.title, recipe: scaled };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof buildChatTools>;

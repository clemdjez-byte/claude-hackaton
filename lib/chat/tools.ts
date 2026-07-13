// lib/chat/tools.ts — les « bras » du copilote de chat « Ask your lab ».
// Miroir en LECTURE SEULE de lib/bench/voice-copilot/tools.ts : le chat ne
// modifie JAMAIS le labo, il ne fait qu'observer (chercher, lire, traverser,
// calculer). Chaque outil délègue à une brique via son interface publique.
// L'agent (route.ts) les appelle de lui-même quand une question demande plus
// que le contexte RAG+KG pré-chargé.
import { tool } from "ai";
import { z } from "zod";
import { round, convert, dilution, molarity, describe, type Db, type Ws } from "@/lib/core";
import { search } from "@/lib/retrieval";
import {
  listProtocols,
  getProtocol,
  previewScaledRecipe,
  exportReportMarkdown,
  listRunsOverview,
} from "@/lib/bench";
import { subgraph } from "@/lib/retrieval/knowledge-graph";
import { collectGraphFacts, renderGenericFacts, loadLabels } from "@/lib/retrieval/knowledge-graph/query";
import { NODE, normalizeParamKey, violatesThreshold, fold } from "@/lib/retrieval/knowledge-graph/ontology";

/** Schéma d'une grandeur physique (valeur + unité) pour les outils de calcul. */
const QTY = z.object({ value: z.number(), unit: z.string() });

/** Un label de nœud KG contient-il la requête (insensible casse/accents) ? */
function labelMatches(labels: Map<string, string>, type: string, id: string, query: string): boolean {
  const label = labels.get(`${type}:${id}`) ?? id;
  return fold(label).includes(fold(query)) || fold(id).includes(fold(query));
}

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

    // ── Calcul de paillasse (déterministe, jamais par le LLM) ──────────────
    dilute: tool({
      description:
        "Solve a serial dilution C1·V1 = C2·V2: the stock volume + diluent volume to reach a final concentration in a final volume. Handles mixed units (nM/µM/mM/M). Report the numbers exactly.",
      inputSchema: z.object({ stockConc: QTY, finalConc: QTY, finalVolume: QTY }),
      execute: async ({ stockConc, finalConc, finalVolume }) => {
        try {
          return { ok: true as const, ...dilution(stockConc, finalConc, finalVolume) };
        } catch (e) {
          return { ok: false as const, reason: e instanceof Error ? e.message : "dilution error" };
        }
      },
    }),

    convert_units: tool({
      description:
        "Convert a quantity between units of the SAME dimension (volume L/mL/µL/nL, mass g/mg/µg/ng, molarity M/mM/µM/nM). Rejects incompatible dimensions (e.g. µL → mg).",
      inputSchema: z.object({ quantity: QTY, toUnit: z.string() }),
      execute: async ({ quantity, toUnit }) => {
        try {
          return { ok: true as const, result: convert(quantity, toUnit) };
        } catch (e) {
          return { ok: false as const, reason: e instanceof Error ? e.message : "conversion error" };
        }
      },
    }),

    molarity_calc: tool({
      description:
        "Solve mass ↔ molarity ↔ volume via molar mass (m = C·V·MW). Give the molar mass (g/mol), which variable to solve, and the two known quantities. E.g. mg of powder for a stock, or the concentration from a weighed mass.",
      inputSchema: z.object({
        molarMass: z.number().describe("g/mol"),
        solve: z.enum(["mass", "concentration", "volume"]),
        mass: QTY.optional(),
        concentration: QTY.optional(),
        volume: QTY.optional(),
      }),
      execute: async ({ molarMass, solve, mass, concentration, volume }) => {
        try {
          return { ok: true as const, result: molarity({ molarMass, solve, mass, concentration, volume }) };
        } catch (e) {
          return { ok: false as const, reason: e instanceof Error ? e.message : "molarity error" };
        }
      },
    }),

    // ── Comparaison & agrégation de données ────────────────────────────────
    compare_runs: tool({
      description:
        "Put several runs side by side: for each, its verdict, numeric parameters and attributed failure cause. Also flags which parameters DIFFER between them. Pass runIds, or a protocolId to compare all its runs.",
      inputSchema: z.object({
        runIds: z.array(z.string()).optional(),
        protocolId: z.string().optional(),
      }),
      execute: async ({ runIds, protocolId }) => {
        const anchors = [
          ...(runIds ?? []).map((id) => NODE.run(id)),
          ...(protocolId ? [NODE.protocol(protocolId)] : []),
        ];
        if (!anchors.length) return { ok: false as const, reason: "provide runIds or a protocolId" };
        const facts = await collectGraphFacts(ctx.db, ctx.ws, anchors);
        const byKey = new Map<string, Set<number>>();
        for (const r of facts.runs)
          for (const p of r.params) {
            if (!byKey.has(p.key)) byKey.set(p.key, new Set());
            byKey.get(p.key)!.add(p.value);
          }
        const differingParams = [...byKey.entries()].filter(([, v]) => v.size > 1).map(([k]) => k);
        return { ok: true as const, runs: facts.runs, differingParams };
      },
    }),

    check_parameter_risk: tool({
      description:
        "Deterministic guardrail: check a value you PLAN to use (cell density, DMSO %, temperature…) against the lab's documented failure modes and warn if it risks a known failure. Only documented thresholds — never a guess.",
      inputSchema: z.object({
        paramLabel: z.string().describe("what the value is, e.g. 'cell density', 'DMSO percentage'"),
        value: z.number(),
        unit: z.string(),
        protocolId: z.string().optional(),
      }),
      execute: async ({ paramLabel, value, unit, protocolId }) => {
        const key = normalizeParamKey(paramLabel) ?? paramLabel;
        const fms = await ctx.db.listFailureModes(
          ctx.ws,
          protocolId ? { protocolId, paramTypeKey: key } : { paramTypeKey: key }
        );
        const violations = [];
        for (const fm of fms) {
          if (fm.operator == null || fm.threshold == null) continue;
          let v = value;
          if (fm.unit && fm.unit !== unit) {
            try {
              v = convert({ value, unit }, fm.unit).value;
            } catch {
              /* unités non convertibles → on compare la valeur brute */
            }
          }
          if (violatesThreshold(fm.operator, fm.threshold, v)) {
            violations.push({
              operator: fm.operator,
              threshold: fm.threshold,
              unit: fm.unit ?? unit,
              mechanism: fm.mechanism,
              verdict: fm.verdict,
              protocolId: fm.protocolId,
            });
          }
        }
        return { ok: true as const, paramTypeKey: key, safe: violations.length === 0, violations };
      },
    }),

    cross_tab_ic50: tool({
      description:
        "Build a metric matrix cell line × drug: for each run, join its cell line, its drug and its titre outcome metric (e.g. IC50 in nM). Averaging per cell is done in code. Optionally filter by protocol or metric unit.",
      inputSchema: z.object({
        protocolId: z.string().optional(),
        metricUnit: z.string().optional().describe("keep only outcomes with this metric unit, e.g. 'nM'"),
      }),
      execute: async ({ protocolId, metricUnit }) => {
        const runs = await ctx.db.listRuns(ctx.ws);
        const labels = await loadLabels(ctx.db, ctx.ws);
        const lbl = (type: string, id: string) => labels.get(`${type}:${id}`) ?? id;
        const cellData = new Map<string, { row: string; col: string; values: number[] }>();
        let unit = metricUnit;
        for (const run of runs) {
          if (protocolId && run.protocolId !== protocolId) continue;
          const outcome = await ctx.db.getOutcomeByRun(run.id);
          if (!outcome?.metric) continue;
          if (metricUnit && outcome.metric.unit !== metricUnit) continue;
          const edges = (await ctx.db.listEdges(ctx.ws, { fromId: run.id })).filter((e) => e.fromType === "run");
          const cell = edges.find((e) => e.toType === "cell_line");
          const drug = edges.find((e) => e.toType === "reagent");
          if (!cell || !drug) continue;
          unit = unit ?? outcome.metric.unit;
          const row = lbl("cell_line", cell.toId);
          const col = lbl("reagent", drug.toId);
          const k = `${row}||${col}`;
          if (!cellData.has(k)) cellData.set(k, { row, col, values: [] });
          cellData.get(k)!.values.push(outcome.metric.value);
        }
        const cells = [...cellData.values()].map(({ row, col, values }) => {
          const stats = describe(values);
          return { row, col, n: values.length, mean: stats?.mean ?? null, values };
        });
        return {
          ok: true as const,
          rowAxis: "cell_line",
          colAxis: "reagent",
          unit,
          rows: [...new Set(cells.map((c) => c.row))],
          cols: [...new Set(cells.map((c) => c.col))],
          cells,
        };
      },
    }),

    summarize_metric: tool({
      description:
        "Descriptive stats (n, mean, median, sd, min, max) on the titre outcome metric of a filtered set of runs, plus a ranking. Filter by protocol, cell line, drug and/or verdict.",
      inputSchema: z.object({
        filter: z
          .object({
            protocolId: z.string().optional(),
            cellLine: z.string().optional(),
            drug: z.string().optional(),
            verdict: z.enum(["success", "failure", "partial"]).optional(),
          })
          .optional(),
        metricUnit: z.string().optional(),
      }),
      execute: async ({ filter, metricUnit }) => {
        const runs = await ctx.db.listRuns(ctx.ws);
        const labels = await loadLabels(ctx.db, ctx.ws);
        const vals: Array<{ runId: string; value: number }> = [];
        let unit = metricUnit;
        for (const run of runs) {
          if (filter?.protocolId && run.protocolId !== filter.protocolId) continue;
          const outcome = await ctx.db.getOutcomeByRun(run.id);
          if (!outcome?.metric) continue;
          if (filter?.verdict && outcome.verdict !== filter.verdict) continue;
          if (metricUnit && outcome.metric.unit !== metricUnit) continue;
          if (filter?.cellLine || filter?.drug) {
            const edges = (await ctx.db.listEdges(ctx.ws, { fromId: run.id })).filter((e) => e.fromType === "run");
            const okCell =
              !filter.cellLine ||
              edges.some((e) => e.toType === "cell_line" && labelMatches(labels, "cell_line", e.toId, filter.cellLine!));
            const okDrug =
              !filter.drug ||
              edges.some((e) => e.toType === "reagent" && labelMatches(labels, "reagent", e.toId, filter.drug!));
            if (!okCell || !okDrug) continue;
          }
          unit = unit ?? outcome.metric.unit;
          vals.push({ runId: run.id, value: outcome.metric.value });
        }
        const stats = describe(vals.map((v) => v.value));
        if (!stats) return { ok: true as const, n: 0, note: "no matching metric found" };
        const ranked = [...vals].sort((a, b) => a.value - b.value);
        return { ok: true as const, unit, ...stats, ranked };
      },
    }),

    aggregate_runs: tool({
      description:
        "Group-by counts on the run inventory: success rate by protocol, runs per cell line/drug, verdict distribution. Counts and percentages computed in code.",
      inputSchema: z.object({
        groupBy: z.enum(["protocol", "cell_line", "reagent", "verdict"]),
      }),
      execute: async ({ groupBy }) => {
        const overview = await listRunsOverview(ctx.db, ctx.ws);
        const labels = await loadLabels(ctx.db, ctx.ws);
        const groups = new Map<
          string,
          { label: string; total: number; success: number; failure: number; partial: number }
        >();
        const bump = (key: string, label: string, verdict?: string) => {
          if (!groups.has(key)) groups.set(key, { label, total: 0, success: 0, failure: 0, partial: 0 });
          const g = groups.get(key)!;
          g.total++;
          if (verdict === "success") g.success++;
          else if (verdict === "failure") g.failure++;
          else if (verdict === "partial") g.partial++;
        };
        for (const o of overview) {
          const outcome = await ctx.db.getOutcomeByRun(o.run.id);
          const verdict = outcome?.verdict;
          if (groupBy === "protocol") bump(o.run.protocolId, o.protocolTitle, verdict);
          else if (groupBy === "verdict") bump(verdict ?? "unknown", verdict ?? "unknown", verdict);
          else {
            const edges = (await ctx.db.listEdges(ctx.ws, { fromId: o.run.id })).filter(
              (e) => e.fromType === "run" && e.toType === groupBy
            );
            for (const e of edges) bump(`${e.toType}:${e.toId}`, labels.get(`${e.toType}:${e.toId}`) ?? e.toId, verdict);
          }
        }
        const result = [...groups.values()].map((g) => ({
          ...g,
          successRate: g.total ? round((g.success / g.total) * 100, 1) : 0,
        }));
        return { ok: true as const, groupBy, groups: result };
      },
    }),

    list_measurements: tool({
      description:
        "Tabulate a run's raw measurements: name × value × unit × instrument. The detail under a headline number, when the question is about the measurement itself.",
      inputSchema: z.object({ runId: z.string() }),
      execute: async ({ runId }) => {
        const items = await ctx.db.listEvidence(runId, { kind: "measurement" });
        return {
          count: items.length,
          measurements: items.map((e) => ({
            name: e.body ?? "measurement",
            value: e.measurement?.value,
            unit: e.measurement?.unit,
            instrument: e.measurement?.instrument,
          })),
        };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof buildChatTools>;

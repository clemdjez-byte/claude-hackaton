// lib/orchestrate.ts — racine de composition (app glue, pas une brique).
// Compose plusieurs briques pour les flux transverses : seed de démo, et
// clôture d'un run (rapport + indexation mémoire + arêtes du graphe). Chaque
// brique aval est gardée par isEnabled → dégradation propre si débrayée.
import { getDb, isEnabled, type Db, type Id, type Ws } from "@/lib/core";
import { listProtocols, seedReferenceProtocol } from "@/features/protocol-studio";
import { completeRun, getRunContext } from "@/features/live-bench";
import { listEvidence } from "@/features/evidence-capture";
import { generateReport } from "@/features/auto-report";
import { indexEntry, search } from "@/features/lab-memory";
import { link } from "@/features/knowledge-graph";

export const DEMO_WS: Ws = "demo-lab";
export const DEMO_OPERATOR: Id = "clement";

/** Prépare un lab de démo idempotent : protocole de référence + mémoire de runs passés. */
export async function ensureSeed(db: Db = getDb()): Promise<void> {
  if (isEnabled("protocolStudio")) {
    const protocols = await listProtocols(db, DEMO_WS).catch(() => []);
    if (protocols.length === 0) await seedReferenceProtocol(db, DEMO_WS);
  }
  if (isEnabled("labMemory")) {
    const existing = await db.listEmbeddings(DEMO_WS);
    if (existing.length === 0) {
      for (const m of PAST_RUNS) {
        await indexEntry(db, { ws: DEMO_WS, sourceType: "run", sourceId: m.id, text: m.text, meta: m.meta });
      }
    }
  }
}

/** Clôt un run : statut completed → rapport → indexation mémoire → graphe. */
export async function finishRun(db: Db, runId: Id): Promise<{ reportId: Id | null }> {
  if (isEnabled("liveBench")) await completeRun(db, runId);
  const ctx = isEnabled("liveBench") ? await getRunContext(db, runId) : null;

  let reportId: Id | null = null;
  if (isEnabled("autoReport")) {
    const report = await generateReport(db, runId);
    reportId = report.id;
    if (isEnabled("labMemory") && ctx) {
      await indexEntry(db, {
        ws: ctx.run.ws,
        sourceType: "report",
        sourceId: report.id,
        text: `Rapport ${ctx.protocol.title} — ${report.content.performed}\n${report.content.deviations.join("\n")}`,
        meta: { runId },
      });
    }
  }

  // Mémoire + graphe à partir des faits du run.
  if (ctx) {
    const evidence = await listEvidence(db, runId).catch(() => []);
    if (isEnabled("labMemory")) {
      const devs = evidence.filter((e) => e.kind === "deviation" && e.deviation);
      const devText = devs.map((e) => `${e.deviation!.expected} → ${e.deviation!.actual} (${e.deviation!.severity})`).join("; ");
      await indexEntry(db, {
        ws: ctx.run.ws,
        sourceType: "run",
        sourceId: runId,
        text: `Run ${ctx.protocol.title} (${ctx.run.scalingContext.n_reactions ?? "?"} réactions). Déviations: ${devText || "aucune"}.`,
        meta: { protocolId: ctx.protocol.id },
      });
    }
    if (isEnabled("knowledgeGraph")) {
      await link(db, ctx.run.ws, { type: "run", id: runId }, "ran_protocol", { type: "protocol", id: ctx.protocol.id });
      for (const e of evidence.filter((x) => x.kind === "deviation"))
        await link(db, ctx.run.ws, { type: "run", id: runId }, "has_deviation", { type: "evidence", id: e.id });
    }
  }
  return { reportId };
}

/** Recherche mémoire de démo (utilisée par la page Mémoire). */
export async function queryMemory(db: Db, ws: Ws, q: string, k = 5) {
  if (!isEnabled("labMemory")) return [];
  return search(db, ws, q, k);
}

// Runs passés pré-indexés pour que « montre-moi les runs où l'hybridation a dévié »
// renvoie quelque chose de crédible dès la démo.
const PAST_RUNS: Array<{ id: string; text: string; meta: Record<string, unknown> }> = [
  {
    id: "run_0702_gapdh",
    text: "Run du 2 juillet — RT-qPCR GAPDH. Hybridation menée à 55 °C au lieu de 60 °C : déviation critique, pics multiples en melt curve (primer-dimers). Résultat écarté.",
    meta: { date: "2026-07-02", gene: "GAPDH", deviation: "hybridation 55C" },
  },
  {
    id: "run_0705_actb",
    text: "Run du 5 juillet — RT-qPCR ACTB. Incubation prolongée 12 min au lieu de 10 : non critique. Ct moyen 22,1, NTC conforme.",
    meta: { date: "2026-07-05", gene: "ACTB", deviation: "incubation 12min" },
  },
  {
    id: "run_0620_il2",
    text: "Run du 20 juin — RT-qPCR IL2. NTC oublié : run re-validé avec contrôle. Hybridation 60 °C nominale, melt curve à pic unique.",
    meta: { date: "2026-06-20", gene: "IL2", deviation: "NTC oublié" },
  },
];

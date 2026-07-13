// scripts/backfill-report-edges.ts — matérialise les arêtes run→report pour les
// rapports déjà présents en base (générés avant l'ajout de la relation
// produced_report dans lib/kg.ts). Idempotent : kg_edge a un index unique
// naturel, ré-exécuter ne crée pas de doublon.
//   npx tsx --env-file-if-exists=.env.local scripts/backfill-report-edges.ts
import { getBenchSession, WS } from "@/lib/session";
import { link } from "@/lib/retrieval/knowledge-graph";
import { NODE, REL } from "@/lib/retrieval/knowledge-graph/ontology";

async function main() {
  const { store } = getBenchSession();
  const pages = await store.listPages(WS, {});
  let n = 0;
  for (const p of pages) {
    if (p.type !== "report") continue;
    const runId = (p.content as { runId?: string } | null)?.runId;
    if (!runId) continue;
    await link(store, WS, NODE.run(runId), REL.producedReport, NODE.report(p.id), { provenance: "derived" });
    n++;
  }
  console.log(`backfill produced_report : ${n} arête(s) run→report`);
  store.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

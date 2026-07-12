// Lecture thin pour Galaxy — nœuds (protocoles, runs, rapports) + arêtes du
// graphe de connaissances de la ws. Un rapport (type='report') porte son
// runId dans son propre content (cf. lib/bench/auto-report), même lecture que
// app/api/files/route.ts. Le protocolId d'un protocole EST l'id de la page
// (pas d'indirection), cf. FilesPanel/ProtocolsClient.
import { getBenchSession, WS } from "@/lib/session";
import { listRunsOverview } from "@/lib/bench";
import type { GNode, GEdge } from "@/app/shell/galaxy-layout";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();
  const [pages, runs, rawEdges] = await Promise.all([
    store.listPages(WS, {}),
    listRunsOverview(store, WS),
    store.listEdges(WS),
  ]);

  const nodes: GNode[] = [];
  for (const p of pages) {
    if (p.type === "report") {
      const runId = (p.content as { runId?: string } | null)?.runId;
      if (!runId) continue; // défense en profondeur (cf. Task 8) : jamais un rapport orphelin
      nodes.push({ id: p.id, kind: "report", label: p.title, params: { runId } });
    } else if (p.type === "protocol") {
      nodes.push({ id: p.id, kind: "protocol", label: p.title, params: { protocolId: p.id } });
    }
  }
  for (const o of runs) {
    nodes.push({ id: o.run.id, kind: "run", label: o.protocolTitle, params: { runId: o.run.id } });
  }

  // Le knowledge graph enrichi crée des arêtes vers des entités sans nœud visuel
  // (parameter_type, reagent, outcome, failure_mode, publication…). On ne garde
  // que les arêtes dont les deux extrémités ont un nœud rendu, pour éviter des
  // arêtes pendantes dans la galaxie (mode ponytail : filtrer, sans étendre le layout).
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = rawEdges
    .filter((e) => ids.has(e.fromId) && ids.has(e.toId))
    .map((e) => ({ from: e.fromId, to: e.toId }));

  return Response.json({ nodes, edges });
}

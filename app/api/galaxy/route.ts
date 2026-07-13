// Lecture pour Galaxy. Deux populations et trois vues de la MÊME workspace :
//   • documents : RAPPORTS et PROTOCOLES (porteurs d'un embedding). Un run n'est
//     PAS un nœud : une expérience est représentée par SON RAPPORT, qui hérite
//     des relations KG du run (paramètres, réactifs, outcome, protocole…).
//   • entités d'ontologie : réactifs, paramètres, outcomes, failure modes,
//     publications… reliées par les relations typées du knowledge graph.
// Trois layouts par nœud :
//   pos     = embedding sémantique (documents) — vue RAG
//   posKg   = topologie du graphe — vue KG
//   posBoth = hybride (documents épinglés à leur pos, entités relâchées) — les deux
// Clés composites `type:id` (comme le KG) : alignent docs et arêtes et évitent
// les collisions d'id entre types. Les arêtes pointant vers un run sont
// redirigées vers le rapport de ce run.
import { getBenchSession, WS } from "@/lib/session";
import { htmlToText } from "@/lib/bench/auto-report";
import { localEmbed } from "@/lib/retrieval/local-embed";
import { projectTo3D } from "@/lib/retrieval";
import { graphLayout3D } from "@/app/shell/graph-layout3d";
import { loadLabels } from "@/lib/retrieval/knowledge-graph/query";
import { REL } from "@/lib/retrieval/knowledge-graph/ontology";
import type { GEdge, GNode3D, Vec3 } from "@/app/shell/galaxy-layout";

export const runtime = "nodejs";

const DOC_TYPES = new Set(["report", "protocol"]);

/** id technique → libellé lisible (best-effort) : slug → Titre, DOI/ids à points laissés tels quels. */
function humanize(id: string): string {
  if (/[./]/.test(id)) return id;
  const s = id.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

export async function GET() {
  const { store } = getBenchSession();
  const [pages, rawEdges, labelMap, failureModes] = await Promise.all([
    store.listPages(WS, {}),
    store.listEdges(WS),
    loadLabels(store, WS), // kg_node + parameter_type
    store.listFailureModes(WS),
  ]);
  for (const fm of failureModes) labelMap.set(`failure_mode:${fm.id}`, fm.mechanism);

  // ── Documents : rapports + protocoles (porteurs d'un embedding) ──
  type Doc = { key: string; rawId: string; type: "report" | "protocol"; label: string; params: Record<string, string>; text: string };
  const docs: Doc[] = [];
  const runToReport = new Map<string, string>(); // runId → clé du rapport (représentant)
  for (const p of pages) {
    if (p.type === "report") {
      const c = p.content as { runId?: string; html?: string } | null;
      if (!c?.runId) continue; // jamais un rapport orphelin
      const key = `report:${p.id}`;
      docs.push({ key, rawId: p.id, type: "report", label: p.title, params: { runId: c.runId }, text: c.html ? htmlToText(c.html) : p.title });
      runToReport.set(c.runId, key);
    } else if (p.type === "protocol") {
      docs.push({ key: `protocol:${p.id}`, rawId: p.id, type: "protocol", label: p.title, params: { protocolId: p.id }, text: p.title });
    }
  }
  const docByKey = new Map(docs.map((d) => [d.key, d]));

  // Redirige une extrémité d'arête : un run → SON rapport ; sinon `type:id`.
  // null = run sans rapport (impossible à représenter → arête ignorée).
  const remap = (type: string, id: string): string | null =>
    type === "run" ? runToReport.get(id) ?? null : `${type}:${id}`;

  // ── Arêtes redirigées + entités d'ontologie référencées ──
  type Ent = { key: string; rawId: string; type: string };
  const entByKey = new Map<string, Ent>();
  const seenEdge = new Set<string>();
  const remapped: GEdge[] = [];
  for (const e of rawEdges) {
    if (e.relation === REL.producedReport) continue; // redondant : le rapport hérite déjà des arêtes du run
    const from = remap(e.fromType, e.fromId);
    const to = remap(e.toType, e.toId);
    if (!from || !to || from === to) continue;
    for (const key of [from, to]) {
      if (docByKey.has(key) || entByKey.has(key)) continue;
      const idx = key.indexOf(":");
      const type = key.slice(0, idx);
      if (DOC_TYPES.has(type)) continue; // réf. de doc introuvable → on ignore
      entByKey.set(key, { key, rawId: key.slice(idx + 1), type });
    }
    const dedup = `${from}|${to}`;
    if (seenEdge.has(dedup)) continue;
    seenEdge.add(dedup);
    remapped.push({ from, to });
  }

  // Arêtes gardées (les deux extrémités ont un nœud).
  const nodeKeys = new Set<string>([...docByKey.keys(), ...entByKey.keys()]);
  const edges: GEdge[] = remapped.filter((e) => nodeKeys.has(e.from) && nodeKeys.has(e.to));

  // ── pos (vue RAG) : on projette les RAPPORTS SEULS (leur texte riche) — nuage
  //    sémantique isotrope (« patate »). Les protocoles sont EXCLUS de la
  //    projection (leur titre court en ferait des outliers qui voleraient la
  //    variance et écraseraient les rapports) : chacun est ramené au BARYCENTRE
  //    de ses rapports (il en est le thème). Les entités n'ont pas de pos. ──
  const reports = docs.filter((d) => d.type === "report");
  const reportPos = projectTo3D(reports.map((d) => localEmbed(d.text)));
  const posByKey = new Map<string, Vec3>();
  reports.forEach((d, i) => posByKey.set(d.key, reportPos[i]));
  const protoReports = new Map<string, Vec3[]>();
  for (const e of edges) {
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]] as const) {
      if (!a.startsWith("protocol:") || !b.startsWith("report:")) continue;
      const rp = posByKey.get(b);
      if (!rp) continue;
      if (!protoReports.has(a)) protoReports.set(a, []);
      protoReports.get(a)!.push(rp);
    }
  }
  for (const d of docs) {
    if (d.type !== "protocol") continue;
    const rs = protoReports.get(d.key);
    if (rs && rs.length) {
      const c: Vec3 = [0, 0, 0];
      for (const r of rs) { c[0] += r[0]; c[1] += r[1]; c[2] += r[2]; }
      posByKey.set(d.key, [c[0] / rs.length, c[1] / rs.length, c[2] / rs.length]);
    } else {
      posByKey.set(d.key, [0, 0, 0]); // protocole sans rapport → centre
    }
  }

  // ── posBoth (vue KG+RAG) : layout FORCE — la répulsion écarte tout (arêtes
  //    longues, nuage aéré = « patate »), et un ressort d'ancrage tire chaque
  //    document vers sa position RAG (il reste ≈ à sa place, l'ontologie se
  //    déploie autour et non par-dessus). ──
  const allKeys = [...docByKey.keys(), ...entByKey.keys()];
  const bothPos = graphLayout3D(allKeys, edges, { iterations: 150, repulsion: 1.4 });
  const posBothByKey = new Map<string, Vec3>();
  allKeys.forEach((k, i) => posBothByKey.set(k, bothPos[i]));

  // ── Assemblage ──
  const nodes: GNode3D[] = [];
  for (const d of docs) {
    nodes.push({
      id: d.key, type: d.type, label: d.label, openable: true, params: d.params,
      isDoc: true,
      pos: posByKey.get(d.key) ?? null,
      posBoth: posBothByKey.get(d.key) ?? [0, 0, 0],
    });
  }
  for (const e of entByKey.values()) {
    nodes.push({
      id: e.key, type: e.type, label: labelMap.get(e.key) ?? humanize(e.rawId), openable: false, params: {},
      isDoc: false,
      pos: null,
      posBoth: posBothByKey.get(e.key) ?? [0, 0, 0],
    });
  }

  return Response.json({ nodes, edges });
}

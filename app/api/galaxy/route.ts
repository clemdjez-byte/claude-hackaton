// Lecture thin pour Galaxy — nœuds (protocoles, runs, rapports) + arêtes du
// graphe de connaissances de la ws, avec DEUX positions 3D par nœud :
//   - pos   : layout sémantique (embedding → project3d) — mode RAG
//   - posKg : layout par la topologie du graphe (graph-layout3d) — mode KG
// Un rapport (type='report') porte son runId dans son propre content (cf.
// lib/bench/auto-report), même lecture que app/api/files/route.ts. Le protocolId
// d'un protocole EST l'id de la page (pas d'indirection), cf. FilesPanel.
import { getBenchSession, WS } from "@/lib/session";
import { listRunsOverview } from "@/lib/bench";
import { htmlToText } from "@/lib/bench/auto-report";
import { localEmbed } from "@/lib/retrieval/local-embed";
import { projectTo3D } from "@/lib/retrieval";
import { graphLayout3D } from "@/app/shell/graph-layout3d";
import type { GNode, GEdge, GNode3D } from "@/app/shell/galaxy-layout";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();
  const [pages, runs, rawEdges, embRows] = await Promise.all([
    store.listPages(WS, {}),
    listRunsOverview(store, WS),
    store.listEdges(WS),
    store.listEmbeddings(WS),
  ]);

  const nodes: GNode[] = [];
  // Texte de repli par id, pour un embedding local si aucun vecteur stocké
  // (base seedée sans Voyage : les rapports ne sont pas indexés). Le contenu est
  // déjà chargé dans p.content — pas de rechargement.
  const fallbackText = new Map<string, string>();
  for (const p of pages) {
    if (p.type === "report") {
      const c = p.content as { runId?: string; html?: string } | null;
      const runId = c?.runId;
      if (!runId) continue; // défense en profondeur : jamais un rapport orphelin
      nodes.push({ id: p.id, kind: "report", label: p.title, params: { runId } });
      fallbackText.set(p.id, c?.html ? htmlToText(c.html) : p.title);
    } else if (p.type === "protocol") {
      nodes.push({ id: p.id, kind: "protocol", label: p.title, params: { protocolId: p.id } });
      fallbackText.set(p.id, p.title);
    }
  }
  for (const o of runs) {
    nodes.push({ id: o.run.id, kind: "run", label: o.protocolTitle, params: { runId: o.run.id } });
    // Titre seul → tous les runs d'un même protocole se superposeraient (même
    // texte). On y ajoute les paramètres résolus (scalingContext) + le statut
    // pour que l'embedding local distingue chaque run.
    const params = Object.entries(o.run.scalingContext)
      .map(([k, v]) => `${k} ${v}`)
      .join(" ");
    fallbackText.set(o.run.id, `${o.protocolTitle} ${params} ${o.run.status}`);
  }

  // Le knowledge graph enrichi crée des arêtes vers des entités sans nœud visuel
  // (parameter_type, reagent, outcome, failure_mode, publication…). On ne garde
  // que les arêtes dont les deux extrémités ont un nœud rendu, pour éviter des
  // arêtes pendantes dans la galaxie (mode ponytail : filtrer, sans étendre le layout).
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = rawEdges
    .filter((e) => ids.has(e.fromId) && ids.has(e.toId))
    .map((e) => ({ from: e.fromId, to: e.toId }));

  // Vecteur par nœud : on privilégie les vrais embeddings stockés (Voyage) quand
  // ils couvrent TOUS les nœuds de façon homogène (même dimension) — sinon on
  // bascule sur un embedding local déterministe, pour que la galaxie fonctionne
  // hors-ligne et sans clé (best-effort : jamais casser le bureau).
  const vecById = new Map<string, number[]>();
  for (const { entry, vector } of embRows) {
    if (entry.sourceType === "evidence") continue; // pas un nœud galaxy
    vecById.set(entry.sourceId, vector);
  }
  const stored = nodes.map((n) => vecById.get(n.id));
  const allStored = nodes.length > 0 && stored.every((v) => v !== undefined);
  const uniformDim = new Set(stored.filter((v): v is number[] => !!v).map((v) => v.length)).size <= 1;
  const vectors: number[][] =
    allStored && uniformDim
      ? stored.map((v) => v as number[])
      : nodes.map((n) => localEmbed(fallbackText.get(n.id) ?? n.label));

  const pos = projectTo3D(vectors);
  const posKg = graphLayout3D(nodes.map((n) => n.id), edges);
  const nodes3d: GNode3D[] = nodes.map((n, i) => ({ ...n, pos: pos[i], posKg: posKg[i] }));

  return Response.json({ nodes: nodes3d, edges });
}

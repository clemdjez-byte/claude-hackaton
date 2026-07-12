// lib/retrieval/knowledge-graph/index.ts — Brique 8.
// Responsabilité unique : relations typées navigables entre entités.
// Les nœuds sont des références polymorphes { type, id } vers des lignes qui
// existent DÉJÀ (protocol, run, reagent, report…) ; les arêtes vivent dans la
// table kg_edge (via db.insertEdge / db.listEdges). Aucune donnée dupliquée :
// le graphe ne stocke que des liens, jamais le contenu des entités.
import { assertEnabled, type Db, type EdgeProvenance, type KgEdge, type Ws } from "@/lib/core";
import type { KgNode } from "./ontology";

export type { KgEdge } from "@/lib/core";

/** Référence polymorphe vers une entité existante (une ligne d'une autre brique).
 *  Source unique de vérité : définie dans ontology.ts, re-exportée ici. */
export type { KgNode } from "./ontology";

/** Sens de parcours d'une arête depuis un nœud donné. */
export type Direction = "out" | "in";

/** Un voisin : le nœud atteint, la relation empruntée et son sens. */
export interface Neighbor {
  node: KgNode;
  relation: string;
  direction: Direction;
}

// ── helpers ──────────────────────────────────────────────────────────────
/** Clé d'identité stable d'un nœud (type + id) pour la déduplication. */
function nodeKey(n: KgNode): string {
  return `${n.type}:${n.id}`;
}

// ── Interface publique ─────────────────────────────────────────────────────

/** Crée une arête typée `from -relation-> to`. `opts` porte la provenance,
 *  la confiance et des attributs libres (ex. has_value → { value, unit }). */
export async function link(
  db: Db,
  ws: Ws,
  from: KgNode,
  relation: string,
  to: KgNode,
  opts?: { provenance?: EdgeProvenance; confidence?: number; attrs?: Record<string, unknown> }
): Promise<KgEdge> {
  assertEnabled("knowledgeGraph");
  return db.insertEdge({
    ws,
    relation,
    fromType: from.type,
    fromId: from.id,
    toType: to.type,
    toId: to.id,
    provenance: opts?.provenance ?? "derived",
    confidence: opts?.confidence ?? 1,
    attrs: opts?.attrs,
  });
}

/**
 * Voisins directs d'un nœud : arêtes sortantes (from = node) ET entrantes
 * (to = node), filtrées par `relation` si fournie. Les nœuds sont polymorphes,
 * donc on recoupe aussi le type pour éviter les collisions d'id entre types.
 */
export async function neighbors(
  db: Db,
  ws: Ws,
  node: KgNode,
  relation?: string
): Promise<Neighbor[]> {
  assertEnabled("knowledgeGraph");

  // Sortants : le nœud est l'origine (from). Voisin = destination (to).
  const outgoing = (await db.listEdges(ws, { relation, fromId: node.id }))
    .filter((e) => e.fromType === node.type)
    .map<Neighbor>((e) => ({
      node: { type: e.toType, id: e.toId },
      relation: e.relation,
      direction: "out",
    }));

  // Entrants : le nœud est la destination (to). Voisin = origine (from).
  const incoming = (await db.listEdges(ws, { relation, toId: node.id }))
    .filter((e) => e.toType === node.type)
    .map<Neighbor>((e) => ({
      node: { type: e.fromType, id: e.fromId },
      relation: e.relation,
      direction: "in",
    }));

  return [...outgoing, ...incoming];
}

/**
 * Sous-graphe atteignable depuis `node` jusqu'à la profondeur `depth` (BFS,
 * arêtes suivies dans les deux sens). Nœuds dédupliqués par type+':'+id,
 * arêtes dédupliquées par id.
 */
export async function subgraph(
  db: Db,
  ws: Ws,
  node: KgNode,
  depth: number
): Promise<{ nodes: KgNode[]; edges: KgEdge[] }> {
  assertEnabled("knowledgeGraph");

  const nodes = new Map<string, KgNode>([[nodeKey(node), node]]);
  const edges = new Map<string, KgEdge>();
  const explored = new Set<string>();
  let frontier: KgNode[] = [node];

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: KgNode[] = [];
    for (const cur of frontier) {
      const key = nodeKey(cur);
      if (explored.has(key)) continue;
      explored.add(key);

      // Sortants (cur = from) et entrants (cur = to), recoupés par type.
      const around: Array<{ edge: KgEdge; neighbor: KgNode }> = [
        ...(await db.listEdges(ws, { fromId: cur.id }))
          .filter((e) => e.fromType === cur.type)
          .map((edge) => ({ edge, neighbor: { type: edge.toType, id: edge.toId } })),
        ...(await db.listEdges(ws, { toId: cur.id }))
          .filter((e) => e.toType === cur.type)
          .map((edge) => ({ edge, neighbor: { type: edge.fromType, id: edge.fromId } })),
      ];

      for (const { edge, neighbor } of around) {
        edges.set(edge.id, edge); // dédup par id
        const nkey = nodeKey(neighbor);
        if (!nodes.has(nkey)) {
          nodes.set(nkey, neighbor); // dédup par type+':'+id
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

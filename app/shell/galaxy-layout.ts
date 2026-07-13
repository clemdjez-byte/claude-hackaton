// app/shell/galaxy-layout.ts — types partagés de la galaxie (nœuds + arêtes).
// La position des nœuds n'est plus radiale : elle vient de deux layouts calculés
// côté serveur (cf. app/api/galaxy/route.ts) — `pos` par embedding sémantique
// (lib/retrieval/project3d) et `posKg` par la topologie du graphe
// (app/shell/graph-layout3d). Ce module ne porte plus que des types.

export type GEdge = { from: string; to: string };

export type Vec3 = [number, number, number];

/** Un nœud de la galaxie : soit un document (rapport/run/protocole, porteur d'un
 *  embedding et ouvrable), soit une entité d'ontologie du knowledge graph
 *  (réactif, paramètre, outcome, failure mode…). Trois positions dans le cube
 *  [-1,1] : `pos` embedding (documents), `posKg` topologie (nœuds du graphe),
 *  `posBoth` hybride (tous). `pos`/`posKg` valent null quand le nœud n'existe
 *  pas dans cette vue (une entité n'a pas d'embedding, un rapport n'est pas
 *  dans le graphe). `id` est la clé composite `type:id`. */
export type GNode3D = {
  id: string;
  type: string;
  label: string;
  openable: boolean;
  params: Record<string, string>;
  isDoc: boolean;
  pos: Vec3 | null; // embedding sémantique (documents) ; null pour une entité d'ontologie
  posBoth: Vec3; // documents à l'embedding + entités ancrées autour (vue KG+RAG)
};

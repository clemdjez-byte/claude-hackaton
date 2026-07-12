// app/shell/galaxy-layout.ts — types partagés de la galaxie (nœuds + arêtes).
// La position des nœuds n'est plus radiale : elle vient de deux layouts calculés
// côté serveur (cf. app/api/galaxy/route.ts) — `pos` par embedding sémantique
// (lib/retrieval/project3d) et `posKg` par la topologie du graphe
// (app/shell/graph-layout3d). Ce module ne porte plus que des types.

export type GNode = {
  id: string;
  kind: "report" | "protocol" | "run";
  label: string;
  params: Record<string, string>;
};

export type GEdge = { from: string; to: string };

export type Vec3 = [number, number, number];

/** Nœud enrichi de ses deux positions 3D (cube [-1,1]) :
 *  `pos` = layout sémantique (RAG), `posKg` = layout du graphe (topologie). */
export type GNode3D = GNode & { pos: Vec3; posKg: Vec3 };

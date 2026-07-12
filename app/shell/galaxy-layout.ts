// app/shell/galaxy-layout.ts — disposition radiale déterministe de la galaxie.
// Aucune simulation, aucun hasard : chaque type de nœud occupe un anneau fixe
// (protocoles au centre, runs au milieu, rapports en périphérie), les nœuds
// d'un même anneau sont répartis à angles réguliers, triés par id pour que
// l'ordre d'entrée n'influence jamais la sortie. Module pur — pas de DOM,
// testable en isolation (cf. galaxy-layout.test.ts).

export type GNode = {
  id: string;
  kind: "report" | "protocol" | "run";
  label: string;
  params: Record<string, string>;
};

export type GEdge = { from: string; to: string };

export type PositionedNode = GNode & { x: number; y: number };

// Anneaux du plus central au plus périphérique.
const KIND_ORDER: GNode["kind"][] = ["protocol", "run", "report"];
const RING_RADIUS: Record<GNode["kind"], number> = {
  protocol: 90,
  run: 220,
  report: 360,
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Place chaque nœud sur l'anneau de son type, à angle régulier. Déterministe :
 *  mêmes nœuds en entrée (quel que soit leur ordre) → mêmes coordonnées en sortie. */
export function layoutNodes(nodes: GNode[]): PositionedNode[] {
  const out: PositionedNode[] = [];
  for (const kind of KIND_ORDER) {
    const ring = nodes.filter((n) => n.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
    const radius = RING_RADIUS[kind];
    ring.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / ring.length;
      out.push({ ...node, x: round3(radius * Math.cos(angle)), y: round3(radius * Math.sin(angle)) });
    });
  }
  return out;
}

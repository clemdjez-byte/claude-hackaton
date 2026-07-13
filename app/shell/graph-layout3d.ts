// app/shell/graph-layout3d.ts — disposition 3D d'un graphe par la TOPOLOGIE
// (mode « KG »), indépendante du sens : les nœuds reliés se rapprochent, les
// autres se repoussent. Force-directed déterministe (init sur une sphère de
// Fibonacci + nombre fixe d'itérations, aucun Math.random), normalisé dans le
// cube [-1,1] comme project3d pour que caméra et morph soient homogènes. Module
// pur (aucun DOM) — importé aussi côté serveur par la route galaxy.
import type { Vec3, GEdge } from "./galaxy-layout";

const ITERATIONS = 300;
const K_REPULSION = 0.02; // force de répulsion entre toutes les paires
const K_ATTRACTION = 0.06; // raideur des ressorts le long des arêtes
const STEP = 0.85; // pas d'intégration (constant → déterministe)
const EPS = 1e-6;

/** Options de layout. `initial` fixe la position de départ d'un nœud (sinon
 *  sphère de Fibonacci) ; `fixed` empêche un nœud de bouger (épinglé) ; `clamp`
 *  borne les coords à [-1,1] en fin de course au lieu de recentrer+normaliser
 *  (indispensable quand des nœuds sont épinglés à des coords qu'on veut garder,
 *  ex. layout hybride où les documents restent à leur position d'embedding). */
export type GraphLayoutOpts = {
  initial?: (Vec3 | null)[];
  fixed?: boolean[];
  clamp?: boolean;
  /** Nombre d'itérations de forces (défaut ITERATIONS). Peu d'itérations depuis
   *  un `initial` sémantique = on garde la forme naturelle des embeddings, les
   *  forces ne font que révéler la topologie sans tout lisser en sphère. */
  iterations?: number;
  /** Multiplicateur de la répulsion (défaut 1). Plus grand = nœuds plus écartés,
   *  arêtes plus longues, nuage plus aéré. */
  repulsion?: number;
};

/** Positionne `nodeIds` en 3D selon les arêtes. Sortie alignée sur l'ordre de
 *  `nodeIds`. Déterministe. Cas limites : [] → [] ; 1 nœud → [[0,0,0]]. */
export function graphLayout3D(nodeIds: string[], edges: GEdge[], opts: GraphLayoutOpts = {}): Vec3[] {
  const n = nodeIds.length;
  if (n === 0) return [];
  if (n === 1) return [opts.initial?.[0] ? [...opts.initial[0]] : [0, 0, 0]];

  // 1. Init : position fournie si donnée, sinon sphère de Fibonacci. Quand des
  //    nœuds sont ancrés (initial fourni — ex. documents à leur embedding), les
  //    nœuds libres sont semés COMPACTS autour de leur barycentre (rayon 0.25) au
  //    lieu d'une sphère lointaine, pour qu'ils viennent nicher parmi les ancres.
  const golden = Math.PI * (3 - Math.sqrt(5));
  let gx = 0, gy = 0, gz = 0, gc = 0;
  for (const p of opts.initial ?? []) if (p) { gx += p[0]; gy += p[1]; gz += p[2]; gc++; }
  const anchored = gc > 0;
  const cx = anchored ? gx / gc : 0;
  const cy = anchored ? gy / gc : 0;
  const cz = anchored ? gz / gc : 0;
  const seedR = anchored ? 0.25 : 1;
  const pos: Vec3[] = nodeIds.map((_, i) => {
    const p = opts.initial?.[i];
    if (p) return [...p]; // démarre à sa position fournie
    const y = 1 - (2 * i) / (n - 1); // de 1 à -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;
    return [cx + seedR * Math.cos(theta) * r, cy + seedR * y, cz + seedR * Math.sin(theta) * r];
  });
  const fixed = opts.fixed ?? [];
  const kRep = K_REPULSION * (opts.repulsion ?? 1);

  // Arêtes → paires d'index (on ignore celles qui pointent hors de la liste).
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  const links: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }

  // 2. Itérations : répulsion (toutes paires) + attraction (arêtes).
  const iterations = opts.iterations ?? ITERATIONS;
  const MAX_STEP = 0.06; // plafond de déplacement/itération : stabilité à grande échelle (évite l'explosion)
  const disp: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) disp[i][0] = disp[i][1] = disp[i][2] = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i][0] - pos[j][0];
        let dy = pos[i][1] - pos[j][1];
        let dz = pos[i][2] - pos[j][2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < EPS) {
          // superposés → écart déterministe dérivé des index.
          dx = (i - j) * EPS;
          dy = EPS;
          dz = 0;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const f = kRep / d2; // ~ 1/d² (Coulomb)
        const d = Math.sqrt(d2);
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        const uz = (dz / d) * f;
        disp[i][0] += ux;
        disp[i][1] += uy;
        disp[i][2] += uz;
        disp[j][0] -= ux;
        disp[j][1] -= uy;
        disp[j][2] -= uz;
      }
    }

    for (const [a, b] of links) {
      const dx = pos[a][0] - pos[b][0];
      const dy = pos[a][1] - pos[b][1];
      const dz = pos[a][2] - pos[b][2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || EPS;
      const f = K_ATTRACTION * d; // ressort de Hooke (∝ distance)
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      const uz = (dz / d) * f;
      disp[a][0] -= ux;
      disp[a][1] -= uy;
      disp[a][2] -= uz;
      disp[b][0] += ux;
      disp[b][1] += uy;
      disp[b][2] += uz;
    }

    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue; // nœud épinglé : ne bouge jamais
      let dx = disp[i][0] * STEP;
      let dy = disp[i][1] * STEP;
      let dz = disp[i][2] * STEP;
      const dl = Math.hypot(dx, dy, dz);
      if (dl > MAX_STEP) {
        const s = MAX_STEP / dl;
        dx *= s;
        dy *= s;
        dz *= s;
      }
      pos[i][0] += dx;
      pos[i][1] += dy;
      pos[i][2] += dz;
    }
  }

  // 3a. Mode clamp : borne dans la SPHÈRE unité sans recentrer (préserve les
  //     nœuds épinglés) — pas de faces plates de cube.
  if (opts.clamp) {
    for (const p of pos) {
      const r = Math.hypot(p[0], p[1], p[2]);
      if (r > 1) { p[0] /= r; p[1] /= r; p[2] /= r; }
    }
    return pos;
  }

  // 3b. Centrer sur le barycentre puis normaliser dans la SPHÈRE unité (forme
  //     organique/patatoïde, bornée). Le ré-alignement final éventuel (ex. remettre
  //     les documents sur leurs positions RAG) se fait côté appelant.
  const c: Vec3 = [0, 0, 0];
  for (const p of pos) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  let maxR = 0;
  for (const p of pos) {
    p[0] -= c[0];
    p[1] -= c[1];
    p[2] -= c[2];
    maxR = Math.max(maxR, Math.hypot(p[0], p[1], p[2]));
  }
  if (maxR > EPS) for (const p of pos) { p[0] /= maxR; p[1] /= maxR; p[2] /= maxR; }

  return pos;
}

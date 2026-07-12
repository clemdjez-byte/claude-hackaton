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

/** Positionne `nodeIds` en 3D selon les arêtes. Sortie alignée sur l'ordre de
 *  `nodeIds`. Déterministe. Cas limites : [] → [] ; 1 nœud → [[0,0,0]]. */
export function graphLayout3D(nodeIds: string[], edges: GEdge[]): Vec3[] {
  const n = nodeIds.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0, 0]];

  // 1. Init déterministe sur une sphère de Fibonacci (répartition régulière).
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pos: Vec3[] = nodeIds.map((_, i) => {
    const y = 1 - (2 * i) / (n - 1); // de 1 à -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;
    return [Math.cos(theta) * r, y, Math.sin(theta) * r];
  });

  // Arêtes → paires d'index (on ignore celles qui pointent hors de la liste).
  const index = new Map(nodeIds.map((id, i) => [id, i]));
  const links: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }

  // 2. Itérations : répulsion (toutes paires) + attraction (arêtes).
  const disp: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);
  for (let it = 0; it < ITERATIONS; it++) {
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
        const f = K_REPULSION / d2; // ~ 1/d² (Coulomb)
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
      pos[i][0] += disp[i][0] * STEP;
      pos[i][1] += disp[i][1] * STEP;
      pos[i][2] += disp[i][2] * STEP;
    }
  }

  // 3. Centrer sur le barycentre puis normaliser dans le cube [-1,1].
  const c: Vec3 = [0, 0, 0];
  for (const p of pos) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  let maxAbs = 0;
  for (const p of pos) {
    p[0] -= c[0];
    p[1] -= c[1];
    p[2] -= c[2];
    maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  }
  if (maxAbs > EPS) for (const p of pos) { p[0] /= maxAbs; p[1] /= maxAbs; p[2] /= maxAbs; }

  return pos;
}

// lib/retrieval/project3d.ts — réduction déterministe d'embeddings N-dim vers 3D
// pour positionner les nœuds de la galaxie par proximité sémantique. Méthode :
// PCA par matrice de Gram (classical MDS). Avec ~18 points de dimension 256, la
// covariance 256×256 serait surtout du bruit (rang utile ≤ n-1) : on diagonalise
// plutôt la petite Gram n×n par rotations de Jacobi (exacte, sans réglage, sans
// hasard → strictement déterministe). Aucune dépendance externe.

const EPS = 1e-9;

/** Diagonalisation d'une matrice symétrique n×n par Jacobi cyclique.
 *  Retourne les valeurs propres (diagonale finale) et les vecteurs propres en
 *  COLONNES de `vectors` (vecteur propre k = vectors[i][k]). Déterministe :
 *  balayage dans un ordre fixe, aucun Math.random. */
function jacobiEigenSymmetric(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  const MAX_SWEEPS = 100;
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break; // hors-diagonale négligeable → convergé
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (apq === 0) continue;
        // Angle de rotation qui annule a[p][q] (on prend la rotation la plus
        // courte, |t| ≤ 1, ce qui garantit la convergence de Jacobi).
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Transformation de similarité Jᵀ·A·J (colonnes puis lignes).
        for (let i = 0; i < n; i++) {
          const aip = a[i][p];
          const aiq = a[i][q];
          a[i][p] = c * aip - s * aiq;
          a[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = a[p][i];
          const aqi = a[q][i];
          a[p][i] = c * api - s * aqi;
          a[q][i] = s * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: V };
}

/** Projette une liste de vecteurs (même dimension) sur 3 axes principaux,
 *  normalisés dans le cube [-1, 1]. Déterministe et indépendant de l'ordre
 *  d'entrée (à permutation près des sorties). Cas limites : [] → [] ; 1 vecteur
 *  → [[0,0,0]] ; vecteurs identiques → tous [0,0,0] (aucun NaN). */
export function projectTo3D(vectors: number[][]): [number, number, number][] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0, 0]];
  const d = vectors[0].length;

  // 1. Centrage par colonne (moyenne sur les n lignes).
  const mean = new Array<number>(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const X = vectors.map((v) => v.map((val, j) => val - mean[j]));

  // 2. Matrice de Gram n×n : G[a][b] = Σ_j X[a][j]·X[b][j] (symétrique).
  const G: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let a = 0; a < n; a++) {
    for (let b = a; b < n; b++) {
      let dot = 0;
      for (let j = 0; j < d; j++) dot += X[a][j] * X[b][j];
      G[a][b] = dot;
      G[b][a] = dot;
    }
  }

  // 3. Diagonalisation + tri des paires propres par valeur propre décroissante
  //    (tie-break déterministe par index croissant).
  const { values, vectors: V } = jacobiEigenSymmetric(G);
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => values[j] - values[i] || i - j
  );

  // 4. Scores PCA : coord[i][k] = vecteur_propre_k[i] · sqrt(max(λk, 0)).
  const coords: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);
  for (let k = 0; k < 3 && k < n; k++) {
    const idx = order[k];
    const lambda = Math.max(values[idx], 0); // Jacobi peut rendre λ ≈ -1e-16
    const sqrtL = Math.sqrt(lambda);
    if (sqrtL <= EPS) continue; // axe dégénéré → reste à 0
    for (let i = 0; i < n; i++) coords[i][k] = V[i][idx] * sqrtL;
  }

  // 4b. Isotropiser : ramener chaque axe au même écart-type → nuage ROND
  //     (« patate »), ni ellipsoïde étiré le long du 1er axe (forme de comète),
  //     ni disque plat. La proximité relative des points est conservée.
  for (let k = 0; k < 3; k++) {
    let mean = 0;
    for (const p of coords) mean += p[k];
    mean /= n;
    let variance = 0;
    for (const p of coords) variance += (p[k] - mean) * (p[k] - mean);
    variance /= n;
    const sd = Math.sqrt(variance);
    if (sd > EPS) for (const p of coords) p[k] = (p[k] - mean) / sd;
  }

  // 5. Désambiguïsation de signe (les vecteurs propres sont définis au signe
  //    près) : on oriente chaque axe pour que sa composante de plus grande
  //    amplitude soit positive. Rattaché à un nœud précis → déterministe.
  for (let k = 0; k < 3; k++) {
    let pivot = 0;
    for (let i = 1; i < n; i++) if (Math.abs(coords[i][k]) > Math.abs(coords[pivot][k])) pivot = i;
    if (coords[pivot][k] < 0) for (let i = 0; i < n; i++) coords[i][k] = -coords[i][k];
  }

  // 6. Normalisation ROBUSTE dans la sphère unité : l'échelle est fixée par le
  //    90e percentile des rayons (le gros du nuage remplit l'espace, sans être
  //    écrasé par un ou deux points extrêmes), puis les rares nœuds au-delà sont
  //    ramenés sur la sphère. Forme naturelle et irrégulière, jamais un cube ni
  //    un blob minuscule au centre.
  const radii = coords.map((p) => Math.hypot(p[0], p[1], p[2])).sort((a, b) => a - b);
  const scale = radii[Math.floor(0.9 * (radii.length - 1))] || radii[radii.length - 1] || 1;
  if (scale > EPS) for (const p of coords) for (let k = 0; k < 3; k++) p[k] /= scale;
  for (const p of coords) {
    const r = Math.hypot(p[0], p[1], p[2]);
    if (r > 1) { p[0] /= r; p[1] /= r; p[2] /= r; }
  }

  return coords;
}

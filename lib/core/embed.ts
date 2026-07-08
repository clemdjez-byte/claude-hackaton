// lib/core/embed.ts — embedder LOCAL, déterministe, ZÉRO dépendance externe
// (hashing bag-of-words normalisé). Suffisant pour la recherche de démo ;
// swappable derrière la même fonction vers un vrai modèle (Voyage / OpenAI
// text-embedding-3-small) pour Sylvy. Le serveur MCP en garde une copie —
// garder les deux en phase (même dimension, même hashing) pour que les
// vecteurs stockés soient comparables.
export const EMBED_DIM = 256;

export function embed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les accents combinants
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % EMBED_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vecteurs déjà normalisés
}

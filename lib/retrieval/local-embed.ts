// lib/retrieval/local-embed.ts — embedder LOCAL déterministe (bag-of-words hashé,
// normalisé L2), hors-ligne et sans dépendance. Il n'est PAS le RAG : le vrai
// RAG passe par Voyage (cf. embed.ts, réseau + clé). Celui-ci sert au
// positionnement de la galaxie sémantique, qui doit rester déterministe,
// instantané et fonctionner même sans VOYAGE_API_KEY ni vecteurs stockés.
export const LOCAL_EMBED_DIM = 256;

export function localEmbed(text: string): number[] {
  const vec = new Array<number>(LOCAL_EMBED_DIM).fill(0);
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
    vec[Math.abs(h) % LOCAL_EMBED_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

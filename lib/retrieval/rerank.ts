// lib/retrieval/rerank.ts — 2e étage optionnel du RAG : re-classe des passages
// déjà sur-récupérés par embeddings, via le reranker Voyage (rerank-2.5). C'est
// le plus gros levier de précision sur le top-k. Désactivable
// (VOYAGE_RERANK=false). En cas d'erreur / timeout / désactivation, l'appelant
// garde l'ordre cosine (repli sûr : voir maybeRerank dans lab-memory).

const RERANK_URL = "https://api.voyageai.com/v1/rerank";
const TIMEOUT_MS = 20_000;

const rerankModel = () => process.env.VOYAGE_RERANK_MODEL || "rerank-2.5";

/** Actif si une clé Voyage est présente et que le rerank n'est pas explicitement coupé. */
export function rerankEnabled(): boolean {
  return !!process.env.VOYAGE_API_KEY && process.env.VOYAGE_RERANK !== "false";
}

/** Renvoie les indices d'entrée réordonnés par pertinence décroissante (≤ topK). */
export async function rerank(
  query: string,
  documents: string[],
  topK: number
): Promise<Array<{ index: number; score: number }>> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY manquante (rerank).");
  const res = await fetch(RERANK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: rerankModel(),
      query,
      documents,
      top_k: topK,
      return_documents: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Voyage rerank a échoué (${res.status}).`);
  const json = (await res.json()) as { data: Array<{ index: number; relevance_score: number }> };
  return json.data.map((d) => ({ index: d.index, score: d.relevance_score }));
}

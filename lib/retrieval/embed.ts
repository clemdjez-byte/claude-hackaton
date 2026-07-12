// lib/retrieval/embed.ts — embeddings sémantiques via Voyage AI (recommandé par
// Anthropic ; il n'existe PAS d'API d'embeddings Claude). Un seul provider,
// derrière ces fonctions : pour swapper vers OpenAI un jour, ne changer QUE ce
// fichier. `cosine` reste local (comparaison de vecteurs, pas de réseau).
//
// Fail-closed : sans VOYAGE_API_KEY, embed()/embedBatch() lèvent une erreur
// claire (comme la couche LLM sans ANTHROPIC_API_KEY). L'indexation appelante
// est best-effort (cf. lib/rag.ts) : l'erreur est avalée, l'action n'est pas
// bloquée, mais rien n'est indexé tant que la clé manque.
//
// L'env est lu à CHAQUE appel (pas figé au chargement du module) pour que les
// tests puissent basculer VOYAGE_API_KEY / VOYAGE_EMBED_DIM via process.env.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const TIMEOUT_MS = 20_000;

export type EmbedKind = "query" | "document";

const model = () => process.env.VOYAGE_MODEL || "voyage-3.5";
const dim = () => Number(process.env.VOYAGE_EMBED_DIM || 1024);

/** Modèle + dimension du provider actif — sert à taguer et filtrer les vecteurs
 *  stockés (on ne compare jamais des vecteurs de modèles différents). */
export function activeEmbedding(): { model: string; dim: number } {
  return { model: model(), dim: dim() };
}

function requireKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key)
    throw new Error(
      "VOYAGE_API_KEY manquante : le RAG (embeddings) ne peut pas fonctionner. Ajoute-la à .env.local."
    );
  return key;
}

const MAX_ATTEMPTS = 3;

/** POST /v1/embeddings avec retries sur 429/5xx : respecte l'en-tête Retry-After
 *  (utile sur le tier gratuit bridé à 3 req/min), sinon backoff exponentiel. */
async function postVoyage(key: string, texts: string[], kind: EmbedKind): Promise<Response> {
  const body = JSON.stringify({
    model: model(),
    input: texts,
    input_type: kind,
    output_dimension: dim(),
  });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return res;
    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < MAX_ATTEMPTS - 1) {
      const retryAfter = Number(res.headers?.get?.("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30_000)
          : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings a échoué (${res.status}) : ${detail.slice(0, 200)}`);
  }
  throw new Error("Voyage embeddings : échec après retry.");
}

/** Vectorise N textes en UN seul appel réseau (Voyage accepte un tableau). */
export async function embedBatch(texts: string[], kind: EmbedKind = "document"): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = requireKey();
  const res = await postVoyage(key, texts, kind);
  const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
  // L'API ne garantit pas l'ordre : trier par `index` avant de mapper.
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/** Confort : vectorise un seul texte. */
export async function embed(text: string, kind: EmbedKind = "document"): Promise<number[]> {
  const [vector] = await embedBatch([text], kind);
  return vector;
}

/** Similarité cosinus (les vecteurs Voyage sont normalisés → produit scalaire). */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// lib/retrieval/lab-memory/index.ts — Brique 6.
// Responsabilité unique : mémoire sémantique du lab. On indexe des entrées
// (runs, protocoles, evidence, reports) sous forme de vecteurs, et on retrouve
// les plus proches d'un contexte textuel. Aucune autre brique n'y touche.
//
// Les vecteurs sont produits par Voyage (embed/embedBatch, embed.ts) et comparés
// par cosine(). Les longs textes sont découpés en chunks (chunk.ts) — une ligne
// `embedding` par chunk. La recherche sur-récupère un pool, le re-classe avec le
// reranker Voyage (optionnel), puis déduplique par source. Stockage via la
// primitive `embedding` (db.insertEmbedding / db.listEmbeddings).
import {
  assertEnabled,
  type Db,
  type MemoryEntry,
  type MemoryHit,
  type MemorySourceType,
  type Ws,
} from "@/lib/core";
import { embed, embedBatch, cosine, activeEmbedding } from "@/lib/retrieval/embed";
import { chunkText } from "@/lib/retrieval/chunk";
import { rerank, rerankEnabled } from "@/lib/retrieval/rerank";

// Seuil sous lequel un score est considéré nul. Utile surtout pour écarter les
// entrées sans aucun recouvrement (produit scalaire exactement 0). Sur des
// vecteurs Voyage denses il ne filtre quasi rien — c'est le pool + le rerank +
// le top-k qui font la pertinence.
const SEUIL_PERTINENCE = 1e-9;

// Taille du pool sur-récupéré avant regroupement / rerank.
const POOL_MIN = 30;

/** Entrée à mémoriser. `meta` transporte le contexte utile (titre, run, etc.). */
export interface IndexInput {
  ws: Ws;
  sourceType: MemorySourceType;
  sourceId: string;
  text: string;
  meta?: Record<string, unknown>;
}

/**
 * Vectorise le texte (découpé en chunks) et l'archive dans la mémoire du lab.
 * Un seul appel réseau Voyage pour tous les chunks. Renvoie une entrée par chunk.
 */
export async function indexEntry(db: Db, input: IndexInput): Promise<MemoryEntry[]> {
  assertEnabled("labMemory");
  const { model, dim } = activeEmbedding();
  const chunks = chunkText(input.text);
  const vectors = await embedBatch(
    chunks.map((c) => c.text),
    "document"
  );
  const entries: MemoryEntry[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const meta =
      chunks.length > 1
        ? { ...(input.meta ?? {}), chunkIndex: chunks[i].index, chunkCount: chunks[i].count }
        : input.meta ?? {};
    entries.push(
      await db.insertEmbedding({
        ws: input.ws,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        text: chunks[i].text,
        vector: vectors[i],
        meta,
        model,
        dim,
      })
    );
  }
  return entries;
}

/** Re-classe le pool via le reranker Voyage. Repli sûr : renvoie tel quel si
 *  désactivé, si trop peu d'éléments, ou en cas d'erreur/timeout. */
async function maybeRerank(query: string, hits: MemoryHit[]): Promise<MemoryHit[]> {
  if (!rerankEnabled() || hits.length <= 1) return hits;
  try {
    const ranked = await rerank(query, hits.map((h) => h.text), hits.length);
    return ranked.map(({ index, score }) => ({ ...hits[index], score }));
  } catch (e) {
    console.warn("[lab-memory] rerank échoué (best-effort, on garde l'ordre cosine) :", e);
    return hits;
  }
}

/**
 * Retrouve les k sources les plus pertinentes pour `query` dans le lab `ws`.
 * Pipeline : embedding de la requête (input_type=query) → cosine sur les vecteurs
 * du provider actif → pool → rerank (optionnel) → dedup par source → top-k.
 */
export async function search(db: Db, ws: Ws, query: string, k = 5): Promise<MemoryHit[]> {
  assertEnabled("labMemory");
  const { model } = activeEmbedding();
  const qv = await embed(query, "query");
  const rows = await db.listEmbeddings(ws, { model });

  // 1) score cosine, garde-fou de dimension (modèle/dim changé sans reseed).
  const scored: MemoryHit[] = [];
  for (const { entry, vector } of rows) {
    if (vector.length !== qv.length) continue;
    const score = cosine(qv, vector);
    if (score > SEUIL_PERTINENCE) scored.push({ ...entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.max(k * 4, POOL_MIN));

  // 2) rerank optionnel du pool.
  const ranked = await maybeRerank(query, pool);

  // 3) dédup : meilleur chunk par source (liste déjà triée best-first).
  const best = new Map<string, MemoryHit>();
  for (const h of ranked) {
    const key = `${h.sourceType}:${h.sourceId}`;
    if (!best.has(key)) best.set(key, h);
  }
  return [...best.values()].slice(0, k);
}

/**
 * Rappel : alias sémantique de `search`. Sert à retrouver les protocoles /
 * runs voisins à partir d'un contexte textuel (« qu'a-t-on déjà fait de proche ? »).
 */
export async function recall(db: Db, ws: Ws, text: string, k = 5): Promise<MemoryHit[]> {
  assertEnabled("labMemory");
  return search(db, ws, text, k);
}

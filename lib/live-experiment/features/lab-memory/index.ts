// features/lab-memory/index.ts — Brique 6.
// Responsabilité unique : mémoire sémantique du lab. On indexe des entrées
// (runs, protocoles, evidence, reports) sous forme de vecteurs, et on retrouve
// les plus proches d'un contexte textuel. Aucune autre brique n'y touche.
//
// Les vecteurs sont produits par embed() (bag-of-words local déterministe) et
// comparés par cosine() — tous deux fournis par le socle. Stockage via la
// primitive `embedding` (db.insertEmbedding / db.listEmbeddings) : aucune table
// nouvelle. Swappable vers pgvector côté Sylvy sans toucher à ce fichier.
import {
  assertEnabled,
  cosine,
  embed,
  type Db,
  type MemoryEntry,
  type MemoryHit,
  type MemorySourceType,
  type Ws,
} from "../../core";

// Seuil sous lequel un score est considéré nul : le bag-of-words normalisé
// donne un produit scalaire exactement 0 quand aucun mot n'est partagé.
const SEUIL_PERTINENCE = 1e-9;

/** Entrée à mémoriser. `meta` transporte le contexte utile (titre, run, etc.). */
export interface IndexInput {
  ws: Ws;
  sourceType: MemorySourceType;
  sourceId: string;
  text: string;
  meta?: Record<string, unknown>;
}

/** Vectorise le texte et l'archive dans la mémoire sémantique du lab. */
export async function indexEntry(db: Db, input: IndexInput): Promise<MemoryEntry> {
  assertEnabled("labMemory");
  const vector = embed(input.text);
  return db.insertEmbedding({
    ws: input.ws,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    text: input.text,
    vector,
    meta: input.meta,
  });
}

/**
 * Retrouve les k entrées les plus proches de `query` dans le lab `ws`.
 * Score = cosine(vecteur de la requête, vecteur de l'entrée), tri décroissant.
 * Les entrées sans aucun mot en commun (score ~0) sont écartées.
 */
export async function search(db: Db, ws: Ws, query: string, k = 5): Promise<MemoryHit[]> {
  assertEnabled("labMemory");
  const qv = embed(query);
  const rows = await db.listEmbeddings(ws);
  return rows
    .map(({ entry, vector }): MemoryHit => ({ ...entry, score: cosine(qv, vector) }))
    .filter((hit) => hit.score > SEUIL_PERTINENCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Rappel : alias sémantique de `search`. Sert à retrouver les protocoles /
 * runs voisins à partir d'un contexte textuel (« qu'a-t-on déjà fait de proche ? »).
 */
export async function recall(db: Db, ws: Ws, text: string, k = 5): Promise<MemoryHit[]> {
  assertEnabled("labMemory");
  return search(db, ws, text, k);
}

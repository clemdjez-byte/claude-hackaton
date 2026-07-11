// lib/retrieval/index.ts — mémoire sémantique du lab : embeddings, indexation,
// recherche, et le graphe de connaissances (relations typées entre entités).

// Embeddings (module pur, dim256 local).
export { EMBED_DIM, embed, cosine } from "./embed";

// Mémoire sémantique (lab-memory).
export { indexEntry, search, recall } from "./lab-memory";

// Graphe de connaissances (knowledge-graph).
export { link, neighbors, subgraph } from "./knowledge-graph";
export type { KgNode, Direction } from "./knowledge-graph";

// lib/core/db.ts — LE seam de persistance (TYPE-ONLY).
// Toute fonction de brique prend `db: Db` en premier argument : c'est ce qui rend
// les briques testables et portables. L'INTERFACE vit ici ; les implémentations
// vivent dans les adaptateurs, jamais dans le cœur :
//   - ./sqlite.ts               → SQLite (better-sqlite3) : tests + repo open-source
//   - (adaptateur hébergé)      → Postgres (RLS + service-role), même interface
// Aucune dépendance de driver ici → le cœur ne tire JAMAIS `better-sqlite3` dans
// un bundle serverless qui utiliserait un autre adaptateur. L'interface est
// asynchrone exprès (SQLite est synchrone, Postgres non ; les briques `await`,
// le swap est invisible).

import { randomBytes } from "node:crypto";
import type {
  Evidence,
  Fichier,
  Folder,
  Id,
  KgEdge,
  MemoryEntry,
  Page,
  Run,
  Step,
  Ws,
} from "./types";

export function shortId(prefix: string): Id {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

// ── Types d'entrée (sans id/createdAt, remplis par la couche de persistance) ──
export type NewPage = { ws: Ws; type: string; title: string; content: unknown; draftDoc?: unknown };
export type NewFichier = {
  ws: Ws;
  pageId?: Id;
  storageKey: string;
  mime: string;
  sha256: string;
  bytes?: Buffer;
};
export type NewRun = Omit<Run, "id" | "startedAt" | "endedAt" | "status"> & {
  status?: Run["status"];
};
export type NewStep = Omit<Step, "id">; // startedAt/completedAt restent optionnels
export type NewEvidence = Omit<Evidence, "id" | "capturedAt">;
export type NewEmbedding = {
  ws: Ws;
  sourceType: MemoryEntry["sourceType"];
  sourceId: Id;
  text: string;
  vector: number[];
  meta?: Record<string, unknown>;
};
export type NewEdge = Omit<KgEdge, "id" | "createdAt">;
export type NewFolder = { ws: Ws; name: string; parentId?: Id | null };

export interface Db {
  // pages (protocol | workflow | report) — primitive versionnée
  insertPage(p: NewPage): Promise<Page>;
  newPageVersion(id: Id, patch: { title?: string; content?: unknown; draftDoc?: unknown }): Promise<Page>;
  updateDraft(id: Id, patch: { title?: string; content?: unknown; draftDoc?: unknown }): Promise<Page>;
  getPage(id: Id, version?: number): Promise<Page | null>;
  listPages(ws: Ws, opts?: { type?: string; latestOnly?: boolean }): Promise<Page[]>;
  deletePage(id: Id): Promise<void>; // supprime une page logique (toutes versions)

  // dossiers (rangement de l'explorateur)
  listFolders(ws: Ws): Promise<Folder[]>;
  insertFolder(nf: NewFolder): Promise<Folder>;
  updateFolder(id: Id, patch: { name?: string; parentId?: Id | null }): Promise<Folder>;
  deleteFolder(id: Id): Promise<void>; // supprime UNE ligne dossier (cascade gérée côté API/tree)
  setPageFolder(id: Id, folderId: Id | null): Promise<void>; // déplace une page (toutes ses versions)

  // fichiers (binaires : photos, exports)
  insertFichier(f: NewFichier): Promise<Fichier>;
  getFichier(id: Id): Promise<Fichier | null>;
  getFichierBytes(id: Id): Promise<Buffer | null>;

  // runs / steps / evidence (log d'exécution requêtable)
  insertRun(r: NewRun): Promise<Run>;
  getRun(id: Id): Promise<Run | null>;
  updateRun(id: Id, patch: Partial<Run>): Promise<Run>;
  listRuns(ws: Ws, opts?: { status?: Run["status"] }): Promise<Run[]>;

  insertStep(s: NewStep): Promise<Step>;
  getStep(id: Id): Promise<Step | null>;
  updateStep(id: Id, patch: Partial<Step>): Promise<Step>;
  listSteps(runId: Id): Promise<Step[]>;

  insertEvidence(e: NewEvidence): Promise<Evidence>;
  listEvidence(runId: Id, opts?: { stepId?: Id; kind?: Evidence["kind"] }): Promise<Evidence[]>;
  getEvidence(id: Id): Promise<Evidence | null>;
  deleteEvidence(id: Id): Promise<void>;

  // embeddings (mémoire sémantique) — seule brique lab-memory à s'en servir
  insertEmbedding(e: NewEmbedding): Promise<MemoryEntry>;
  listEmbeddings(ws: Ws): Promise<Array<{ entry: MemoryEntry; vector: number[] }>>;

  // knowledge graph
  insertEdge(e: NewEdge): Promise<KgEdge>;
  listEdges(
    ws: Ws,
    opts?: { relation?: string; fromId?: Id; toId?: Id }
  ): Promise<KgEdge[]>;

  close(): void;
}

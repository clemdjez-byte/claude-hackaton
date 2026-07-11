// lib/live-experiment/adapters.standalone.ts — implémentation SQLite du store
// (better-sqlite3). C'est l'adaptateur PAR DÉFAUT du repo open-source et le
// harnais des tests unitaires (createDb(':memory:')). Il implémente l'interface
// Db définie dans core/db.ts.
//
// ⚠️ Ce fichier importe `better-sqlite3` (module natif). Il ne doit être importé
// QUE par les tests et le repo OSS — JAMAIS par un fichier atteignable depuis le
// runtime Next de Sylvy (qui n'importe QUE adapters.sylvy.ts), sinon better-sqlite3
// finit dans le bundle serverless (plan §9.3). L'invariant CI du plan §11 le vérifie.

import Database from "better-sqlite3";
import type {
  Evidence,
  Fichier,
  KgEdge,
  MemoryEntry,
  Page,
  Run,
  Step,
} from "./core/types";
import { shortId, type Db } from "./core/db";

function nowIso(): string {
  return new Date().toISOString();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS page (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL, ws TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
  content TEXT NOT NULL, version INTEGER NOT NULL, latest INTEGER NOT NULL,
  created_at TEXT NOT NULL, draft_doc TEXT
);
CREATE INDEX IF NOT EXISTS page_id_idx ON page(id, version);
CREATE INDEX IF NOT EXISTS page_ws_idx ON page(ws, type, latest);

CREATE TABLE IF NOT EXISTS fichier (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, page_id TEXT, storage_key TEXT NOT NULL,
  mime TEXT NOT NULL, sha256 TEXT NOT NULL, bytes BLOB, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, operator TEXT NOT NULL,
  workflow_id TEXT, workflow_version INTEGER, protocol_id TEXT NOT NULL,
  protocol_version INTEGER NOT NULL, status TEXT NOT NULL,
  scaling_context TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
);
CREATE INDEX IF NOT EXISTS run_ws_idx ON run(ws, status);

CREATE TABLE IF NOT EXISTS step (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, protocol_step_index INTEGER NOT NULL,
  title TEXT NOT NULL, status TEXT NOT NULL, resolved_params TEXT,
  started_at TEXT, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS step_run_idx ON step(run_id, protocol_step_index);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_id TEXT, author_id TEXT NOT NULL,
  captured_at TEXT NOT NULL, kind TEXT NOT NULL, body TEXT, file_id TEXT,
  measurement TEXT, deviation TEXT, source TEXT
);
CREATE INDEX IF NOT EXISTS evidence_run_idx ON evidence(run_id, step_id);

CREATE TABLE IF NOT EXISTS embedding (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, source_type TEXT NOT NULL,
  source_id TEXT NOT NULL, text TEXT NOT NULL, vector TEXT NOT NULL,
  meta TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS embedding_ws_idx ON embedding(ws);

CREATE TABLE IF NOT EXISTS kg_edge (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, relation TEXT NOT NULL,
  from_type TEXT NOT NULL, from_id TEXT NOT NULL, to_type TEXT NOT NULL,
  to_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS kg_edge_ws_idx ON kg_edge(ws, relation);
`;

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);
const p = <T>(v: unknown): T => (v == null ? (null as T) : (JSON.parse(v as string) as T));

function toPage(r: Row): Page {
  return {
    id: r.id as string,
    ws: r.ws as string,
    type: r.type as string,
    title: r.title as string,
    content: p(r.content),
    version: r.version as number,
    latest: !!r.latest,
    createdAt: r.created_at as string,
    draftDoc: r.draft_doc == null ? undefined : p(r.draft_doc),
  };
}
function toFichier(r: Row): Fichier {
  return {
    id: r.id as string,
    ws: r.ws as string,
    pageId: (r.page_id as string) ?? undefined,
    storageKey: r.storage_key as string,
    mime: r.mime as string,
    sha256: r.sha256 as string,
    createdAt: r.created_at as string,
  };
}
function toRun(r: Row): Run {
  return {
    id: r.id as string,
    ws: r.ws as string,
    operator: r.operator as string,
    workflowId: (r.workflow_id as string) ?? undefined,
    workflowVersion: (r.workflow_version as number) ?? undefined,
    protocolId: r.protocol_id as string,
    protocolVersion: r.protocol_version as number,
    status: r.status as Run["status"],
    scalingContext: p(r.scaling_context) ?? {},
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? undefined,
  };
}
function toStep(r: Row): Step {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    protocolStepIndex: r.protocol_step_index as number,
    title: r.title as string,
    status: r.status as Step["status"],
    resolvedParams: p(r.resolved_params) ?? undefined,
    startedAt: (r.started_at as string) ?? undefined,
    completedAt: (r.completed_at as string) ?? undefined,
  };
}
function toEvidence(r: Row): Evidence {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    stepId: (r.step_id as string) ?? undefined,
    authorId: r.author_id as string,
    capturedAt: r.captured_at as string,
    kind: r.kind as Evidence["kind"],
    body: (r.body as string) ?? undefined,
    fileId: (r.file_id as string) ?? undefined,
    measurement: p(r.measurement) ?? undefined,
    deviation: p(r.deviation) ?? undefined,
    source: p(r.source) ?? undefined,
  };
}
function toEdge(r: Row): KgEdge {
  return {
    id: r.id as string,
    ws: r.ws as string,
    relation: r.relation as string,
    fromType: r.from_type as string,
    fromId: r.from_id as string,
    toType: r.to_type as string,
    toId: r.to_id as string,
    createdAt: r.created_at as string,
  };
}

export function createDb(path = ":memory:"): Db {
  const sql = new Database(path);
  sql.pragma("journal_mode = WAL");
  sql.exec(SCHEMA);

  return {
    async insertPage(np) {
      const id = shortId("pg");
      const row: Page = {
        id,
        ws: np.ws,
        type: np.type,
        title: np.title,
        content: np.content,
        version: 1,
        latest: true,
        createdAt: nowIso(),
        draftDoc: np.draftDoc,
      };
      sql
        .prepare(
          `INSERT INTO page (id, ws, type, title, content, version, latest, created_at, draft_doc)
           VALUES (@id, @ws, @type, @title, @content, 1, 1, @createdAt, @draft_doc)`
        )
        .run({ ...row, content: j(np.content), latest: 1, draft_doc: np.draftDoc == null ? null : j(np.draftDoc) });
      return row;
    },

    async newPageVersion(id, patch) {
      const cur = sql
        .prepare(`SELECT * FROM page WHERE id = ? AND latest = 1`)
        .get(id) as Row | undefined;
      if (!cur) throw new Error(`Page introuvable : ${id}`);
      sql.prepare(`UPDATE page SET latest = 0 WHERE id = ?`).run(id);
      const draftDoc = patch.draftDoc !== undefined ? patch.draftDoc : (cur.draft_doc == null ? undefined : p(cur.draft_doc));
      const next: Page = {
        id,
        ws: cur.ws as string,
        type: cur.type as string,
        title: patch.title ?? (cur.title as string),
        content: patch.content ?? p(cur.content),
        version: (cur.version as number) + 1,
        latest: true,
        createdAt: nowIso(),
        draftDoc: draftDoc == null ? undefined : draftDoc,
      };
      sql
        .prepare(
          `INSERT INTO page (id, ws, type, title, content, version, latest, created_at, draft_doc)
           VALUES (@id, @ws, @type, @title, @content, @version, 1, @createdAt, @draft_doc)`
        )
        .run({ ...next, content: j(next.content), latest: 1, draft_doc: draftDoc == null ? null : j(draftDoc) });
      return next;
    },

    async updateDraft(id, patch) {
      const cur = sql.prepare(`SELECT * FROM page WHERE id = ? AND latest = 1`).get(id) as Row | undefined;
      if (!cur) throw new Error(`Page introuvable : ${id}`);
      const title = patch.title ?? (cur.title as string);
      const content = patch.content !== undefined ? patch.content : p(cur.content);
      const draftDoc = patch.draftDoc !== undefined ? patch.draftDoc : (cur.draft_doc == null ? undefined : p(cur.draft_doc));
      sql
        .prepare(`UPDATE page SET title = @title, content = @content, draft_doc = @draft_doc WHERE id = @id AND latest = 1`)
        .run({ id, title, content: j(content), draft_doc: draftDoc == null ? null : j(draftDoc) });
      return {
        id, ws: cur.ws as string, type: cur.type as string, title,
        content, version: cur.version as number, latest: true,
        createdAt: cur.created_at as string, draftDoc: draftDoc == null ? undefined : draftDoc,
      };
    },

    async getPage(id, version) {
      const r = (
        version == null
          ? sql.prepare(`SELECT * FROM page WHERE id = ? AND latest = 1`).get(id)
          : sql.prepare(`SELECT * FROM page WHERE id = ? AND version = ?`).get(id, version)
      ) as Row | undefined;
      return r ? toPage(r) : null;
    },

    async listPages(ws, opts) {
      const clauses = ["ws = ?"];
      const args: unknown[] = [ws];
      if (opts?.type) {
        clauses.push("type = ?");
        args.push(opts.type);
      }
      if (opts?.latestOnly !== false) clauses.push("latest = 1");
      const rows = sql
        .prepare(`SELECT * FROM page WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
        .all(...args) as Row[];
      return rows.map(toPage);
    },

    async insertFichier(nf) {
      const id = shortId("fic");
      const createdAt = nowIso();
      sql
        .prepare(
          `INSERT INTO fichier (id, ws, page_id, storage_key, mime, sha256, bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, nf.ws, nf.pageId ?? null, nf.storageKey, nf.mime, nf.sha256, nf.bytes ?? null, createdAt);
      return {
        id,
        ws: nf.ws,
        pageId: nf.pageId,
        storageKey: nf.storageKey,
        mime: nf.mime,
        sha256: nf.sha256,
        createdAt,
      };
    },
    async getFichier(id) {
      const r = sql.prepare(`SELECT * FROM fichier WHERE id = ?`).get(id) as Row | undefined;
      return r ? toFichier(r) : null;
    },
    async getFichierBytes(id) {
      const r = sql.prepare(`SELECT bytes FROM fichier WHERE id = ?`).get(id) as Row | undefined;
      return r?.bytes ? (r.bytes as Buffer) : null;
    },

    async insertRun(nr) {
      const id = shortId("run");
      const run: Run = {
        id,
        ws: nr.ws,
        operator: nr.operator,
        workflowId: nr.workflowId,
        workflowVersion: nr.workflowVersion,
        protocolId: nr.protocolId,
        protocolVersion: nr.protocolVersion,
        status: nr.status ?? "active",
        scalingContext: nr.scalingContext ?? {},
        startedAt: nowIso(),
      };
      sql
        .prepare(
          `INSERT INTO run (id, ws, operator, workflow_id, workflow_version, protocol_id,
             protocol_version, status, scaling_context, started_at, ended_at)
           VALUES (@id, @ws, @operator, @workflowId, @workflowVersion, @protocolId,
             @protocolVersion, @status, @scaling_context, @startedAt, NULL)`
        )
        .run({
          ...run,
          workflowId: run.workflowId ?? null,
          workflowVersion: run.workflowVersion ?? null,
          scaling_context: j(run.scalingContext),
        });
      return run;
    },
    async getRun(id) {
      const r = sql.prepare(`SELECT * FROM run WHERE id = ?`).get(id) as Row | undefined;
      return r ? toRun(r) : null;
    },
    async updateRun(id, patch) {
      const cur = await this.getRun(id);
      if (!cur) throw new Error(`Run introuvable : ${id}`);
      const next: Run = { ...cur, ...patch };
      sql
        .prepare(
          `UPDATE run SET status = @status, scaling_context = @scaling_context, ended_at = @ended_at WHERE id = @id`
        )
        .run({
          id,
          status: next.status,
          scaling_context: j(next.scalingContext),
          ended_at: next.endedAt ?? null,
        });
      return next;
    },
    async listRuns(ws, opts) {
      const rows = (
        opts?.status
          ? sql.prepare(`SELECT * FROM run WHERE ws = ? AND status = ? ORDER BY started_at DESC`).all(ws, opts.status)
          : sql.prepare(`SELECT * FROM run WHERE ws = ? ORDER BY started_at DESC`).all(ws)
      ) as Row[];
      return rows.map(toRun);
    },

    async insertStep(ns) {
      const id = shortId("stp");
      const step: Step = { ...ns, id };
      sql
        .prepare(
          `INSERT INTO step (id, run_id, protocol_step_index, title, status, resolved_params, started_at, completed_at)
           VALUES (@id, @runId, @protocolStepIndex, @title, @status, @resolved_params, @started_at, @completed_at)`
        )
        .run({
          id,
          runId: ns.runId,
          protocolStepIndex: ns.protocolStepIndex,
          title: ns.title,
          status: ns.status,
          resolved_params: ns.resolvedParams ? j(ns.resolvedParams) : null,
          started_at: ns.startedAt ?? null,
          completed_at: ns.completedAt ?? null,
        });
      return step;
    },
    async getStep(id) {
      const r = sql.prepare(`SELECT * FROM step WHERE id = ?`).get(id) as Row | undefined;
      return r ? toStep(r) : null;
    },
    async updateStep(id, patch) {
      const cur = await this.getStep(id);
      if (!cur) throw new Error(`Step introuvable : ${id}`);
      const next: Step = { ...cur, ...patch };
      sql
        .prepare(
          `UPDATE step SET status = @status, resolved_params = @resolved_params,
             started_at = @started_at, completed_at = @completed_at WHERE id = @id`
        )
        .run({
          id,
          status: next.status,
          resolved_params: next.resolvedParams ? j(next.resolvedParams) : null,
          started_at: next.startedAt ?? null,
          completed_at: next.completedAt ?? null,
        });
      return next;
    },
    async listSteps(runId) {
      const rows = sql
        .prepare(`SELECT * FROM step WHERE run_id = ? ORDER BY protocol_step_index ASC`)
        .all(runId) as Row[];
      return rows.map(toStep);
    },

    async insertEvidence(ne) {
      const id = shortId("ev");
      const ev: Evidence = { ...ne, id, capturedAt: nowIso() };
      sql
        .prepare(
          `INSERT INTO evidence (id, run_id, step_id, author_id, captured_at, kind, body, file_id, measurement, deviation, source)
           VALUES (@id, @runId, @stepId, @authorId, @capturedAt, @kind, @body, @fileId, @measurement, @deviation, @source)`
        )
        .run({
          id,
          runId: ev.runId,
          stepId: ev.stepId ?? null,
          authorId: ev.authorId,
          capturedAt: ev.capturedAt,
          kind: ev.kind,
          body: ev.body ?? null,
          fileId: ev.fileId ?? null,
          measurement: ev.measurement ? j(ev.measurement) : null,
          deviation: ev.deviation ? j(ev.deviation) : null,
          source: ev.source ? j(ev.source) : null,
        });
      return ev;
    },
    async listEvidence(runId, opts) {
      const clauses = ["run_id = ?"];
      const args: unknown[] = [runId];
      if (opts?.stepId) {
        clauses.push("step_id = ?");
        args.push(opts.stepId);
      }
      if (opts?.kind) {
        clauses.push("kind = ?");
        args.push(opts.kind);
      }
      const rows = sql
        .prepare(`SELECT * FROM evidence WHERE ${clauses.join(" AND ")} ORDER BY captured_at ASC`)
        .all(...args) as Row[];
      return rows.map(toEvidence);
    },
    async getEvidence(id) {
      const row = sql.prepare(`SELECT * FROM evidence WHERE id = ?`).get(id) as Row | undefined;
      return row ? toEvidence(row) : null;
    },
    async deleteEvidence(id) {
      sql.prepare(`DELETE FROM evidence WHERE id = ?`).run(id);
    },

    async insertEmbedding(ne) {
      const id = shortId("mem");
      const createdAt = nowIso();
      const entry: MemoryEntry = {
        id,
        ws: ne.ws,
        sourceType: ne.sourceType,
        sourceId: ne.sourceId,
        text: ne.text,
        meta: ne.meta ?? {},
        createdAt,
      };
      sql
        .prepare(
          `INSERT INTO embedding (id, ws, source_type, source_id, text, vector, meta, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, ne.ws, ne.sourceType, ne.sourceId, ne.text, j(ne.vector), j(entry.meta), createdAt);
      return entry;
    },
    async listEmbeddings(ws) {
      const rows = sql.prepare(`SELECT * FROM embedding WHERE ws = ?`).all(ws) as Row[];
      return rows.map((r) => ({
        entry: {
          id: r.id as string,
          ws: r.ws as string,
          sourceType: r.source_type as MemoryEntry["sourceType"],
          sourceId: r.source_id as string,
          text: r.text as string,
          meta: p(r.meta) ?? {},
          createdAt: r.created_at as string,
        },
        vector: p<number[]>(r.vector) ?? [],
      }));
    },

    async insertEdge(nedge) {
      const id = shortId("kg");
      const createdAt = nowIso();
      const edge: KgEdge = { ...nedge, id, createdAt };
      sql
        .prepare(
          `INSERT INTO kg_edge (id, ws, relation, from_type, from_id, to_type, to_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, edge.ws, edge.relation, edge.fromType, edge.fromId, edge.toType, edge.toId, createdAt);
      return edge;
    },
    async listEdges(ws, opts) {
      const clauses = ["ws = ?"];
      const args: unknown[] = [ws];
      if (opts?.relation) {
        clauses.push("relation = ?");
        args.push(opts.relation);
      }
      if (opts?.fromId) {
        clauses.push("from_id = ?");
        args.push(opts.fromId);
      }
      if (opts?.toId) {
        clauses.push("to_id = ?");
        args.push(opts.toId);
      }
      const rows = sql
        .prepare(`SELECT * FROM kg_edge WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC`)
        .all(...args) as Row[];
      return rows.map(toEdge);
    },

    close() {
      sql.close();
    },
  };
}

// Singleton applicatif standalone (les tests utilisent createDb(':memory:')).
let _db: Db | null = null;
export function getDb(): Db {
  if (!_db) _db = createDb(process.env.OCTOPUS_DB_PATH || "octopus.db");
  return _db;
}

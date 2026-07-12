// lib/core/sqlite.ts — implémentation SQLite du store (better-sqlite3).
// L'adaptateur PAR DÉFAUT (et unique) du repo : harnais des tests unitaires
// (createDb(':memory:')) et persistance de l'appli (getDb(), singleton sur
// data/octopus.db). Implémente l'interface Db définie dans ./db.ts.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  Evidence,
  FailureMode,
  Fichier,
  Folder,
  KgEdge,
  MemoryEntry,
  Outcome,
  Page,
  ParameterType,
  Run,
  Step,
} from "./types";
import { shortId, type Db } from "./db";

function nowIso(): string {
  return new Date().toISOString();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS page (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL, ws TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
  content TEXT NOT NULL, version INTEGER NOT NULL, latest INTEGER NOT NULL,
  created_at TEXT NOT NULL, draft_doc TEXT, folder_id TEXT
);
CREATE INDEX IF NOT EXISTS page_id_idx ON page(id, version);
CREATE INDEX IF NOT EXISTS page_ws_idx ON page(ws, type, latest);

CREATE TABLE IF NOT EXISTS folder (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, name TEXT NOT NULL,
  parent_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS folder_ws_idx ON folder(ws, parent_id);

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
  to_id TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'derived',
  confidence REAL NOT NULL DEFAULT 1.0, attrs TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS kg_edge_ws_idx ON kg_edge(ws, relation);

CREATE TABLE IF NOT EXISTS outcome (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, run_id TEXT NOT NULL,
  verdict TEXT NOT NULL, metric TEXT, reason TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outcome_run_idx ON outcome(run_id);

CREATE TABLE IF NOT EXISTS failure_mode (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, protocol_id TEXT NOT NULL,
  param_type_key TEXT, operator TEXT, threshold REAL, unit TEXT, trigger TEXT,
  verdict TEXT NOT NULL, mechanism TEXT NOT NULL,
  source_ref TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS failure_mode_ws_idx ON failure_mode(ws, protocol_id, param_type_key);

CREATE TABLE IF NOT EXISTS parameter_type (
  ws TEXT NOT NULL, key TEXT NOT NULL, label TEXT NOT NULL, unit TEXT NOT NULL,
  aliases TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ws, key)
);
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
    folderId: (r.folder_id as string) ?? null,
  };
}
function toFolder(r: Row): Folder {
  return {
    id: r.id as string,
    ws: r.ws as string,
    name: r.name as string,
    parentId: (r.parent_id as string) ?? null,
    createdAt: r.created_at as string,
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
    provenance: (r.provenance as KgEdge["provenance"]) ?? "derived",
    confidence: r.confidence == null ? 1 : (r.confidence as number),
    attrs: r.attrs == null ? undefined : p<Record<string, unknown>>(r.attrs),
    createdAt: r.created_at as string,
  };
}
function toOutcome(r: Row): Outcome {
  return {
    id: r.id as string,
    ws: r.ws as string,
    runId: r.run_id as string,
    verdict: r.verdict as Outcome["verdict"],
    metric: r.metric == null ? undefined : p<{ value: number; unit: string }>(r.metric),
    reason: (r.reason as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}
function toFailureMode(r: Row): FailureMode {
  return {
    id: r.id as string,
    ws: r.ws as string,
    protocolId: r.protocol_id as string,
    paramTypeKey: (r.param_type_key as string) ?? undefined,
    operator: (r.operator as FailureMode["operator"]) ?? undefined,
    threshold: r.threshold == null ? undefined : (r.threshold as number),
    unit: (r.unit as string) ?? undefined,
    trigger: (r.trigger as string) ?? undefined,
    verdict: r.verdict as FailureMode["verdict"],
    mechanism: r.mechanism as string,
    sourceRef: r.source_ref == null ? undefined : p(r.source_ref),
    createdAt: r.created_at as string,
  };
}
function toParameterType(r: Row): ParameterType {
  return {
    id: `${r.ws}:${r.key}`,
    ws: r.ws as string,
    key: r.key as string,
    label: r.label as string,
    unit: r.unit as string,
    aliases: p<string[]>(r.aliases) ?? [],
    createdAt: r.created_at as string,
  };
}

export function createDb(path = ":memory:"): Db {
  const sql = new Database(path);
  sql.pragma("journal_mode = WAL");
  sql.exec(SCHEMA);

  // Migration idempotente : bases existantes créées avant l'ajout de folder_id.
  const cols = sql.prepare(`PRAGMA table_info(page)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "folder_id")) {
    sql.exec(`ALTER TABLE page ADD COLUMN folder_id TEXT`);
  }

  // Migration idempotente : bases existantes créées avant l'enrichissement du
  // knowledge graph (provenance/confidence/attrs sur kg_edge).
  const edgeCols = sql.prepare(`PRAGMA table_info(kg_edge)`).all() as { name: string }[];
  if (!edgeCols.some((c) => c.name === "provenance")) {
    sql.exec(`ALTER TABLE kg_edge ADD COLUMN provenance TEXT NOT NULL DEFAULT 'derived'`);
  }
  if (!edgeCols.some((c) => c.name === "confidence")) {
    sql.exec(`ALTER TABLE kg_edge ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0`);
  }
  if (!edgeCols.some((c) => c.name === "attrs")) {
    sql.exec(`ALTER TABLE kg_edge ADD COLUMN attrs TEXT`);
  }

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
        folderId: null,
      };
      sql
        .prepare(
          `INSERT INTO page (id, ws, type, title, content, version, latest, created_at, draft_doc, folder_id)
           VALUES (@id, @ws, @type, @title, @content, 1, 1, @createdAt, @draft_doc, NULL)`
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
      const folderId = (cur.folder_id as string) ?? null;
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
        folderId,
      };
      sql
        .prepare(
          `INSERT INTO page (id, ws, type, title, content, version, latest, created_at, draft_doc, folder_id)
           VALUES (@id, @ws, @type, @title, @content, @version, 1, @createdAt, @draft_doc, @folder_id)`
        )
        .run({ ...next, content: j(next.content), latest: 1, draft_doc: draftDoc == null ? null : j(draftDoc), folder_id: folderId });
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
        folderId: (cur.folder_id as string) ?? null,
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

    async deletePage(id) {
      sql.prepare(`DELETE FROM page WHERE id = ?`).run(id);
    },

    async listFolders(ws) {
      const rows = sql.prepare(`SELECT * FROM folder WHERE ws = ? ORDER BY name`).all(ws) as Row[];
      return rows.map(toFolder);
    },
    async insertFolder(nf) {
      const id = shortId("fld");
      const createdAt = nowIso();
      const folder: Folder = { id, ws: nf.ws, name: nf.name, parentId: nf.parentId ?? null, createdAt };
      sql
        .prepare(`INSERT INTO folder (id, ws, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(id, folder.ws, folder.name, folder.parentId, createdAt);
      return folder;
    },
    async updateFolder(id, patch) {
      const cur = sql.prepare(`SELECT * FROM folder WHERE id = ?`).get(id) as Row | undefined;
      if (!cur) throw new Error(`Dossier introuvable : ${id}`);
      const name = patch.name ?? (cur.name as string);
      const parentId = patch.parentId !== undefined ? patch.parentId : ((cur.parent_id as string) ?? null);
      sql
        .prepare(`UPDATE folder SET name = @name, parent_id = @parentId WHERE id = @id`)
        .run({ id, name, parentId });
      return { id, ws: cur.ws as string, name, parentId, createdAt: cur.created_at as string };
    },
    async deleteFolder(id) {
      sql.prepare(`DELETE FROM folder WHERE id = ?`).run(id);
    },
    async setPageFolder(id, folderId) {
      sql.prepare(`UPDATE page SET folder_id = ? WHERE id = ?`).run(folderId, id);
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
      const provenance = nedge.provenance ?? "derived";
      const confidence = nedge.confidence ?? 1;
      const edge: KgEdge = { ...nedge, provenance, confidence, id, createdAt };
      sql
        .prepare(
          `INSERT INTO kg_edge (id, ws, relation, from_type, from_id, to_type, to_id, provenance, confidence, attrs, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, edge.ws, edge.relation, edge.fromType, edge.fromId, edge.toType, edge.toId,
          provenance, confidence, edge.attrs == null ? null : j(edge.attrs), createdAt
        );
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

    async insertOutcome(no) {
      const id = shortId("oc");
      const createdAt = nowIso();
      const o: Outcome = { ...no, id, createdAt };
      sql
        .prepare(
          `INSERT INTO outcome (id, ws, run_id, verdict, metric, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, o.ws, o.runId, o.verdict, o.metric == null ? null : j(o.metric), o.reason ?? null, createdAt);
      return o;
    },
    async getOutcomeByRun(runId) {
      const r = sql.prepare(`SELECT * FROM outcome WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`).get(runId) as Row | undefined;
      return r ? toOutcome(r) : null;
    },
    async insertFailureMode(nf) {
      const id = shortId("fm");
      const createdAt = nowIso();
      const f: FailureMode = { ...nf, id, createdAt };
      sql
        .prepare(
          `INSERT INTO failure_mode (id, ws, protocol_id, param_type_key, operator, threshold, unit, trigger, verdict, mechanism, source_ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, f.ws, f.protocolId, f.paramTypeKey ?? null, f.operator ?? null,
          f.threshold ?? null, f.unit ?? null, f.trigger ?? null, f.verdict, f.mechanism,
          f.sourceRef == null ? null : j(f.sourceRef), createdAt
        );
      return f;
    },
    async listFailureModes(ws, opts) {
      const clauses = ["ws = ?"];
      const args: unknown[] = [ws];
      if (opts?.protocolId) { clauses.push("protocol_id = ?"); args.push(opts.protocolId); }
      if (opts?.paramTypeKey) { clauses.push("param_type_key = ?"); args.push(opts.paramTypeKey); }
      const rows = sql.prepare(`SELECT * FROM failure_mode WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC`).all(...args) as Row[];
      return rows.map(toFailureMode);
    },
    async upsertParameterType(np) {
      const createdAt = nowIso();
      sql
        .prepare(
          `INSERT INTO parameter_type (ws, key, label, unit, aliases, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(ws, key) DO UPDATE SET label = excluded.label, unit = excluded.unit, aliases = excluded.aliases`
        )
        .run(np.ws, np.key, np.label, np.unit, j(np.aliases), createdAt);
      const r = sql.prepare(`SELECT * FROM parameter_type WHERE ws = ? AND key = ?`).get(np.ws, np.key) as Row;
      return toParameterType(r);
    },
    async listParameterTypes(ws) {
      const rows = sql.prepare(`SELECT * FROM parameter_type WHERE ws = ? ORDER BY key ASC`).all(ws) as Row[];
      return rows.map(toParameterType);
    },

    close() {
      sql.close();
    },
  };
}

// Singleton applicatif standalone (les tests utilisent createDb(':memory:')).
let _db: Db | null = null;
export function getDb(): Db {
  if (!_db) {
    const path = process.env.OCTOPUS_DB_PATH || "data/octopus.db";
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    _db = createDb(path);
  }
  return _db;
}

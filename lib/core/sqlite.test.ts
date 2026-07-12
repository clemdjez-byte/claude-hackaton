import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, afterEach } from "vitest";
import { createDb } from "./sqlite";

// Le seam en action : SQLite :memory: joue le rôle du « faux Db injecté ».
describe("Db seam (SQLite :memory:)", () => {
  it("versionne une page (protocol) : v1 latest, puis v2 latest", async () => {
    const db = createDb(":memory:");
    const v1 = await db.insertPage({ ws: "lab1", type: "protocol", title: "qPCR", content: { steps: 1 } });
    expect(v1.version).toBe(1);
    const v2 = await db.newPageVersion(v1.id, { content: { steps: 2 } });
    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id); // identifiant logique stable

    const latest = await db.getPage(v1.id);
    expect(latest?.version).toBe(2);
    const pinned = await db.getPage(v1.id, 1);
    expect(pinned?.content).toEqual({ steps: 1 });
    db.close();
  });

  it("crée un run + steps, avance un step, liste dans l'ordre", async () => {
    const db = createDb(":memory:");
    const run = await db.insertRun({
      ws: "lab1",
      operator: "u1",
      protocolId: "pg_x",
      protocolVersion: 1,
      scalingContext: { n_reactions: 24 },
    });
    expect(run.status).toBe("active");
    const s0 = await db.insertStep({ runId: run.id, protocolStepIndex: 0, title: "Prep", status: "pending" });
    await db.insertStep({ runId: run.id, protocolStepIndex: 1, title: "Mix", status: "pending" });
    const done = await db.updateStep(s0.id, { status: "done", completedAt: new Date().toISOString() });
    expect(done.status).toBe("done");
    const steps = await db.listSteps(run.id);
    expect(steps.map((s) => s.title)).toEqual(["Prep", "Mix"]);
    db.close();
  });

  it("attache une evidence (déviation) à un step et la retrouve", async () => {
    const db = createDb(":memory:");
    const run = await db.insertRun({ ws: "lab1", operator: "u1", protocolId: "pg_x", protocolVersion: 1, scalingContext: {} });
    const ev = await db.insertEvidence({
      runId: run.id,
      stepId: "stp_1",
      authorId: "u1",
      kind: "deviation",
      deviation: { expected: "60 °C", actual: "55 °C", severity: "critical" },
    });
    expect(ev.id).toMatch(/^ev_/);
    const list = await db.listEvidence(run.id, { kind: "deviation" });
    expect(list).toHaveLength(1);
    expect(list[0].deviation?.severity).toBe("critical");
    db.close();
  });

  it("indexe des embeddings et les relit avec leur vecteur", async () => {
    const db = createDb(":memory:");
    await db.insertEmbedding({ ws: "lab1", sourceType: "run", sourceId: "run_1", text: "incubation 12 min", vector: [0.1, 0.2], model: "voyage-3.5", dim: 2 });
    const all = await db.listEmbeddings("lab1");
    expect(all).toHaveLength(1);
    expect(all[0].vector).toEqual([0.1, 0.2]);
    db.close();
  });

  it("listEmbeddings filtre par modèle (isole les espaces vectoriels)", async () => {
    const db = createDb(":memory:");
    await db.insertEmbedding({ ws: "lab1", sourceType: "run", sourceId: "r_a", text: "a", vector: [1], model: "voyage-3.5", dim: 1 });
    await db.insertEmbedding({ ws: "lab1", sourceType: "run", sourceId: "r_b", text: "b", vector: [2], model: "autre", dim: 1 });
    expect(await db.listEmbeddings("lab1")).toHaveLength(2); // sans filtre : tout
    const voyage = await db.listEmbeddings("lab1", { model: "voyage-3.5" });
    expect(voyage.map((e) => e.entry.sourceId)).toEqual(["r_a"]);
    expect(await db.listEmbeddings("lab1", { model: "inconnu" })).toEqual([]);
    db.close();
  });
});

describe("draft_doc : brouillon mutable + figeage immuable", () => {
  it("insertPage stocke draftDoc et getPage le relit", async () => {
    const db = createDb();
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    const page = await db.insertPage({ ws: "ws1", type: "protocol", title: "P", content: { a: 1 }, draftDoc: doc });
    const back = await db.getPage(page.id);
    expect(back?.draftDoc).toEqual(doc);
    db.close();
  });

  it("updateDraft mute la ligne latest EN PLACE (même version)", async () => {
    const db = createDb();
    const page = await db.insertPage({ ws: "ws1", type: "protocol", title: "P", content: { a: 1 } });
    const updated = await db.updateDraft(page.id, { content: { a: 2 }, draftDoc: { type: "doc" } });
    expect(updated.version).toBe(1); // pas de nouvelle version
    const back = await db.getPage(page.id);
    expect(back?.content).toEqual({ a: 2 });
    expect(back?.draftDoc).toEqual({ type: "doc" });
    db.close();
  });

  it("newPageVersion recopie draftDoc vers la nouvelle version", async () => {
    const db = createDb();
    const page = await db.insertPage({ ws: "ws1", type: "protocol", title: "P", content: { a: 1 }, draftDoc: { type: "doc" } });
    const v2 = await db.newPageVersion(page.id, { content: { a: 2 } });
    expect(v2.version).toBe(2);
    expect(v2.draftDoc).toEqual({ type: "doc" });
    db.close();
  });

  it("une version figée (non-latest) n'est pas mutée par updateDraft", async () => {
    const db = createDb();
    const page = await db.insertPage({ ws: "ws1", type: "protocol", title: "P", content: { v: 1 } });
    await db.newPageVersion(page.id, { content: { v: 2 } }); // v1 devient figée, v2 latest
    await db.updateDraft(page.id, { content: { v: 3 } });     // ne touche que latest (v2)
    const frozen = await db.getPage(page.id, 1);
    expect(frozen?.content).toEqual({ v: 1 });                // v1 intacte
    db.close();
  });
});

describe("folder : rangement de l'explorateur", () => {
  it("insertFolder puis listFolders la retrouve, triée par nom", async () => {
    const db = createDb();
    await db.insertFolder({ ws: "ws1", name: "Zèbre" });
    await db.insertFolder({ ws: "ws1", name: "Alpha" });
    const list = await db.listFolders("ws1");
    expect(list.map((f) => f.name)).toEqual(["Alpha", "Zèbre"]);
    expect(list[0].parentId).toBeNull();
    db.close();
  });

  it("insertFolder avec parentId imbrique le dossier", async () => {
    const db = createDb();
    const parent = await db.insertFolder({ ws: "ws1", name: "Parent" });
    const child = await db.insertFolder({ ws: "ws1", name: "Enfant", parentId: parent.id });
    const list = await db.listFolders("ws1");
    const got = list.find((f) => f.id === child.id);
    expect(got?.parentId).toBe(parent.id);
    db.close();
  });

  it("updateFolder renomme et/ou reparente", async () => {
    const db = createDb();
    const a = await db.insertFolder({ ws: "ws1", name: "A" });
    const b = await db.insertFolder({ ws: "ws1", name: "B" });
    const renamed = await db.updateFolder(a.id, { name: "A2" });
    expect(renamed.name).toBe("A2");
    expect(renamed.parentId).toBeNull();
    const reparented = await db.updateFolder(a.id, { parentId: b.id });
    expect(reparented.parentId).toBe(b.id);
    expect(reparented.name).toBe("A2"); // conservé
    const backToRoot = await db.updateFolder(a.id, { parentId: null });
    expect(backToRoot.parentId).toBeNull();
    db.close();
  });

  it("deleteFolder retire uniquement la ligne visée", async () => {
    const db = createDb();
    const a = await db.insertFolder({ ws: "ws1", name: "A" });
    const b = await db.insertFolder({ ws: "ws1", name: "B" });
    await db.deleteFolder(a.id);
    const list = await db.listFolders("ws1");
    expect(list.map((f) => f.id)).toEqual([b.id]);
    db.close();
  });

  it("insertPage démarre à la racine (folderId null) ; setPageFolder déplace toutes les versions", async () => {
    const db = createDb();
    const folder = await db.insertFolder({ ws: "ws1", name: "Rapports" });
    const page = await db.insertPage({ ws: "ws1", type: "report", title: "R1", content: {} });
    expect(page.folderId).toBeNull();

    await db.setPageFolder(page.id, folder.id);
    const v2 = await db.newPageVersion(page.id, { content: { done: true } });
    expect(v2.folderId).toBe(folder.id); // la nouvelle version hérite du dossier courant

    const latest = await db.getPage(page.id);
    expect(latest?.folderId).toBe(folder.id);
    const pinned = await db.getPage(page.id, 1);
    expect(pinned?.folderId).toBe(folder.id); // setPageFolder a bougé TOUTES les versions

    await db.setPageFolder(page.id, null);
    const back = await db.getPage(page.id);
    expect(back?.folderId).toBeNull();

    const listed = await db.listPages("ws1", { type: "report" });
    expect(listed.find((p) => p.id === page.id)?.folderId).toBeNull();
    db.close();
  });

  it("deletePage retire toutes les versions de la page", async () => {
    const db = createDb();
    const page = await db.insertPage({ ws: "ws1", type: "report", title: "R1", content: { v: 1 } });
    await db.newPageVersion(page.id, { content: { v: 2 } });
    await db.deletePage(page.id);
    expect(await db.getPage(page.id)).toBeNull();
    expect(await db.getPage(page.id, 1)).toBeNull();
    db.close();
  });

  it("insertPage sur un createDb rejoué (schéma ré-exécuté) reste idempotent", async () => {
    const db = createDb(); // sql.exec(SCHEMA) tourne à chaque createDb → doit rester idempotent
    const page = await db.insertPage({ ws: "ws1", type: "report", title: "R", content: {} });
    expect(page.folderId).toBeNull();
    const back = await db.getPage(page.id);
    expect(back).toHaveProperty("folderId");
    db.close();
  });
});

describe("migration folder_id : bases existantes créées avant l'ajout de la colonne", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("ALTER TABLE ADD COLUMN tourne au réouverture d'une base pré-migration", async () => {
    dir = mkdtempSync(join(tmpdir(), "octopus-migration-"));
    const path = join(dir, "old.db");

    // Simule une base créée AVANT l'ajout de folder_id : table page sans cette colonne.
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE page (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL, ws TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
        content TEXT NOT NULL, version INTEGER NOT NULL, latest INTEGER NOT NULL,
        created_at TEXT NOT NULL, draft_doc TEXT
      );
    `);
    legacy.prepare(
      `INSERT INTO page (id, ws, type, title, content, version, latest, created_at)
       VALUES ('pg_legacy', 'ws1', 'report', 'Vieux rapport', '{}', 1, 1, '2020-01-01T00:00:00.000Z')`
    ).run();
    const colsBefore = legacy.prepare(`PRAGMA table_info(page)`).all() as { name: string }[];
    expect(colsBefore.some((c) => c.name === "folder_id")).toBe(false);
    legacy.close();

    // Réouverture via createDb : la migration idempotente doit ajouter folder_id sans casser les données.
    const db = createDb(path);
    const reopened = new Database(path);
    const colsAfter = reopened.prepare(`PRAGMA table_info(page)`).all() as { name: string }[];
    expect(colsAfter.some((c) => c.name === "folder_id")).toBe(true);
    reopened.close();

    const legacyPage = await db.getPage("pg_legacy");
    expect(legacyPage?.title).toBe("Vieux rapport"); // donnée pré-existante intacte
    expect(legacyPage?.folderId).toBeNull(); // nouvelle colonne, valeur par défaut NULL

    // Et createDb ré-exécuté sur la même base (déjà migrée) ne casse rien.
    db.close();
    const db2 = createDb(path);
    const stillThere = await db2.getPage("pg_legacy");
    expect(stillThere?.title).toBe("Vieux rapport");
    db2.close();
  });
});

describe("kg_edge : déduplication (upsert sur clé naturelle)", () => {
  it("deux insertEdge identiques → une seule arête, id stable, attrs/confidence mis à jour", async () => {
    const db = createDb(":memory:");
    const base = {
      ws: "ws1", relation: "uses", fromType: "run", fromId: "r1", toType: "reagent", toId: "mitotracker",
    } as const;
    const first = await db.insertEdge({ ...base, provenance: "extracted", confidence: 0.5, attrs: { note: "a" } });
    const second = await db.insertEdge({ ...base, provenance: "extracted", confidence: 0.9, attrs: { note: "b" } });

    const edges = await db.listEdges("ws1", { relation: "uses" });
    expect(edges).toHaveLength(1); // pas de doublon
    expect(second.id).toBe(first.id); // id de la première insertion conservé
    expect(edges[0].confidence).toBe(0.9); // DO UPDATE a écrasé
    expect(edges[0].attrs).toEqual({ note: "b" });
    db.close();
  });

  it("des arêtes à clé naturelle distincte coexistent", async () => {
    const db = createDb(":memory:");
    await db.insertEdge({ ws: "ws1", relation: "uses", fromType: "run", fromId: "r1", toType: "reagent", toId: "a" });
    await db.insertEdge({ ws: "ws1", relation: "uses", fromType: "run", fromId: "r1", toType: "reagent", toId: "b" });
    await db.insertEdge({ ws: "ws1", relation: "measured", fromType: "run", fromId: "r1", toType: "reagent", toId: "a" });
    expect(await db.listEdges("ws1")).toHaveLength(3);
    db.close();
  });
});

describe("kg_node : registre canonique générique (upsert + union d'alias)", () => {
  it("upsertKgEntity sur (ws,type,key) met à jour label/alias sans dupliquer", async () => {
    const db = createDb(":memory:");
    await db.upsertKgEntity({ ws: "ws1", type: "instrument", key: "confocal_zeiss", label: "Confocal Zeiss", aliases: ["zeiss"] });
    await db.upsertKgEntity({ ws: "ws1", type: "instrument", key: "confocal_zeiss", label: "Confocal Zeiss LSM980", aliases: ["zeiss", "lsm980"] });

    const insts = await db.listKgEntities("ws1", { type: "instrument" });
    expect(insts).toHaveLength(1);
    expect(insts[0].label).toBe("Confocal Zeiss LSM980");
    expect(insts[0].aliases).toEqual(["zeiss", "lsm980"]);
    expect(insts[0].provenance).toBe("extracted"); // défaut
    db.close();
  });

  it("listKgEntities filtre par type", async () => {
    const db = createDb(":memory:");
    await db.upsertKgEntity({ ws: "ws1", type: "instrument", key: "confocal", label: "Confocal", aliases: [] });
    await db.upsertKgEntity({ ws: "ws1", type: "operator", key: "clement", label: "Clément", aliases: [] });
    expect(await db.listKgEntities("ws1")).toHaveLength(2);
    expect(await db.listKgEntities("ws1", { type: "operator" })).toHaveLength(1);
    db.close();
  });

  it("mergeKgEntity re-pointe les arêtes, déduplique et supprime le perdant", async () => {
    const db = createDb(":memory:");
    await db.upsertKgEntity({ ws: "ws1", type: "reagent", key: "keep", label: "Keep", aliases: [] });
    await db.upsertKgEntity({ ws: "ws1", type: "reagent", key: "loser", label: "Loser", aliases: [] });
    // Arête sans conflit : run r2 → loser (doit migrer vers keep).
    await db.insertEdge({ ws: "ws1", relation: "uses", fromType: "run", fromId: "r2", toType: "reagent", toId: "loser" });
    // Arêtes en conflit : r1 → keep ET r1 → loser (le re-pointage créerait un doublon).
    await db.insertEdge({ ws: "ws1", relation: "uses", fromType: "run", fromId: "r1", toType: "reagent", toId: "keep" });
    await db.insertEdge({ ws: "ws1", relation: "uses", fromType: "run", fromId: "r1", toType: "reagent", toId: "loser" });

    await db.mergeKgEntity("ws1", "reagent", "keep", "loser");

    // Le nœud perdant a disparu.
    expect((await db.listKgEntities("ws1", { type: "reagent" })).map((e) => e.key)).toEqual(["keep"]);
    // Arêtes : r1→keep (le doublon a été résorbé) + r2→keep (migrée). Aucune vers loser.
    const edges = await db.listEdges("ws1", { relation: "uses" });
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.toId === "keep")).toBe(true);
    expect(new Set(edges.map((e) => e.fromId))).toEqual(new Set(["r1", "r2"]));
    db.close();
  });
});

describe("migration kg_edge : dédup + index unique sur base pré-existante", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("dédoublonne les arêtes legacy AVANT de poser l'index unique", async () => {
    dir = mkdtempSync(join(tmpdir(), "octopus-kgedge-"));
    const path = join(dir, "old.db");

    // Base legacy : kg_edge sans index unique, avec DEUX arêtes de même clé naturelle.
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE kg_edge (
        id TEXT PRIMARY KEY, ws TEXT NOT NULL, relation TEXT NOT NULL,
        from_type TEXT NOT NULL, from_id TEXT NOT NULL, to_type TEXT NOT NULL,
        to_id TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'derived',
        confidence REAL NOT NULL DEFAULT 1.0, attrs TEXT, created_at TEXT NOT NULL
      );
    `);
    for (const id of ["kg_a", "kg_b"]) {
      legacy.prepare(
        `INSERT INTO kg_edge (id, ws, relation, from_type, from_id, to_type, to_id, provenance, confidence, created_at)
         VALUES (?, 'ws1', 'uses', 'run', 'r1', 'reagent', 'x', 'derived', 1.0, '2020-01-01T00:00:00.000Z')`
      ).run(id);
    }
    legacy.close();

    // Réouverture : la migration dédoublonne (garde la plus ancienne) puis pose l'index.
    const db = createDb(path);
    const edges = await db.listEdges("ws1");
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("kg_a"); // MIN(rowid) = la première insérée

    // Ré-ouverture idempotente : ne re-dédoublonne pas, ne casse pas.
    db.close();
    const db2 = createDb(path);
    expect(await db2.listEdges("ws1")).toHaveLength(1);
    db2.close();
  });
});

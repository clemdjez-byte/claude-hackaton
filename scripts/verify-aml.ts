// scripts/verify-aml.ts — read-only sanity check of the AML seed: counts,
// signed-report ratio, KG/RAG population, and one English+signed report sample.
// Safe to run while the seed is still writing (WAL allows concurrent reads).
import Database from "better-sqlite3";

const path = process.env.OCTOPUS_DB_PATH || "octopus.db";
const db = new Database(path, { readonly: true, fileMustExist: true });
const one = (q: string): number => (db.prepare(q).get() as { c: number }).c;

const protocols = one(`SELECT COUNT(*) c FROM page WHERE type='protocol' AND latest=1`);
const runs = one(`SELECT COUNT(*) c FROM run`);
const reports = one(`SELECT COUNT(*) c FROM page WHERE type='report' AND latest=1`);
const signed = one(
  `SELECT COUNT(*) c FROM page WHERE type='report' AND latest=1 AND json_extract(content,'$.signedAt') IS NOT NULL`
);
const outcomes = one(`SELECT COUNT(*) c FROM outcome`);
const kgNodes = one(`SELECT COUNT(*) c FROM kg_node`);
const kgEdges = one(`SELECT COUNT(*) c FROM kg_edge`);
const failureModes = one(`SELECT COUNT(*) c FROM failure_mode`);
const embeddings = one(`SELECT COUNT(*) c FROM embedding`);

console.log("── AML seed verification ──");
console.log(`protocols        : ${protocols}`);
console.log(`runs             : ${runs}`);
console.log(`reports (latest) : ${reports}`);
console.log(`  ↳ SIGNED       : ${signed} / ${reports}${reports && signed === reports ? "  ✓ all signed" : ""}`);
console.log(`outcomes (verdict): ${outcomes}`);
console.log(`KG nodes         : ${kgNodes}`);
console.log(`KG edges         : ${kgEdges}`);
console.log(`failure_mode     : ${failureModes}`);
console.log(`RAG embeddings   : ${embeddings}`);

// KG node types distribution
const types = db
  .prepare(`SELECT type, COUNT(*) c FROM kg_node GROUP BY type ORDER BY c DESC`)
  .all() as { type: string; c: number }[];
console.log(`KG node types    : ${types.map((t) => `${t.type}=${t.c}`).join(", ")}`);

// Sample the most recent signed report — English + signature check
const sample = db
  .prepare(
    `SELECT title, content FROM page WHERE type='report' AND latest=1
       AND json_extract(content,'$.signedAt') IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`
  )
  .get() as { title: string; content: string } | undefined;
if (sample) {
  const c = JSON.parse(sample.content);
  const html: string = c.html ?? "";
  const english = ["Objective", "Planned", "Performed", "Interpretation"].filter((s) => html.includes(s));
  const french = ["Objectif", "Prévu", "Réellement fait", "Interprétation"].filter((s) => html.includes(s));
  console.log(`\nSample report    : ${sample.title}`);
  console.log(`  signedBy       : ${c.signedBy}`);
  console.log(`  signedAt       : ${c.signedAt}`);
  console.log(`  English sects  : ${english.join(", ") || "NONE"}`);
  console.log(`  French sects   : ${french.join(", ") || "none ✓"}`);
}

// French leak scan across ALL latest reports + protocols
const allDocs = db
  .prepare(`SELECT content FROM page WHERE type IN ('report','protocol') AND latest=1`)
  .all() as { content: string }[];
const FR = ["Objectif", "Prévu", "Réellement fait", "Déviations", "Interprétation", "Questions ouvertes", "Prochaines actions", "Annexe", "Aucune"];
let frHits = 0;
for (const d of allDocs) for (const w of FR) if (d.content.includes(w)) { frHits++; break; }
console.log(`\nFrench-leak scan : ${frHits} / ${allDocs.length} docs contain a French section marker ${frHits === 0 ? "✓" : "✗"}`);

// Date range across runs
const range = db.prepare(`SELECT MIN(started_at) lo, MAX(started_at) hi FROM run`).get() as { lo: string; hi: string };
console.log(`Run date range   : ${range.lo?.slice(0, 10)} → ${range.hi?.slice(0, 10)}`);
db.close();

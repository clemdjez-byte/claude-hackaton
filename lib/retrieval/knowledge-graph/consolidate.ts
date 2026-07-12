// lib/retrieval/knowledge-graph/consolidate.ts — scan de dédoublonnage du KG.
// Complément de la réconciliation à l'écriture (resolve.ts) : rattrape les
// synonymes qui ont GLISSÉ — typiquement « concentration quizartinib » vs « dose
// de quizartinib », que le slug/alias ne rapproche pas et que l'IA n'a pas
// fusionnés en contexte (ordre d'indexation, plafond des entités connues…).
// Deux temps :
//   1) Tier 1 — DÉTERMINISTE et sûr : mêmes type + même forme compacte
//      (« MitoTracker » = « Mito Tracker » = « mito-tracker »). Fusion sans IA.
//   2) Tier 2 — AMBIGU : mêmes type + un token significatif partagé. Tranché par
//      un juge LLM CONSERVATEUR (fail-closed sans clé). Fusionne « quizartinib
//      concentration » ⟷ « dose de quizartinib », pas « quizartinib » ⟷ « sorafenib ».
// Fusion via db.mergeKgEntity (union-find pour la transitivité). Idempotent : la
// dédup d'arêtes garantit qu'aucun doublon n'est créé par le re-pointage.
import { assertEnabled, hasLlmKey, generateObjectFor, type Db, type KgEntity, type Ws } from "@/lib/core";
import { z } from "zod";
import { fold } from "./ontology";

export interface Merge {
  type: string;
  survivor: string; // clé conservée
  survivorLabel: string;
  merged: string[]; // clés absorbées
}
export interface ConsolidationReport {
  merges: Merge[];
  candidatesConsidered: number; // paires ambiguës examinées (Tier 2)
  llmUsed: boolean;
}

const JUDGE_CAP = 40; // borne des paires envoyées au juge (coût)
const STOP = new Set(["de", "du", "des", "la", "le", "les", "the", "of", "and", "et", "pour", "avec", "au", "aux", "un", "une", "à"]);

/** Forme compacte : fold + suppression de tout séparateur → « Mito Tracker » et
 *  « MitoTracker » collent. Base du Tier 1 (fusion déterministe sûre). */
function foldTight(s: string): string {
  return fold(s).replace(/[^a-z0-9]/g, "");
}

/** Tokens significatifs d'une entité (label + alias), pour le Tier 2. */
function tokens(e: KgEntity): Set<string> {
  return new Set(
    fold([e.label, ...e.aliases].join(" "))
      .split(" ")
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}

function shareToken(a: KgEntity, b: KgEntity): boolean {
  const ta = tokens(a);
  for (const t of tokens(b)) if (ta.has(t)) return true;
  return false;
}

/** Survivant d'un groupe : le plus riche en alias, puis le plus ancien (établi). */
function pickSurvivor(members: KgEntity[]): KgEntity {
  return [...members].sort(
    (a, b) => b.aliases.length - a.aliases.length || (a.createdAt < b.createdAt ? -1 : 1)
  )[0];
}

// ── union-find sur les identités « type:key » ──────────────────────────────
class DSU {
  private parent = new Map<string, string>();
  add(x: string) { if (!this.parent.has(x)) this.parent.set(x, x); }
  find(x: string): string {
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) { const n = this.parent.get(c)!; this.parent.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { this.add(a); this.add(b); this.parent.set(this.find(a), this.find(b)); }
  connected(a: string, b: string): boolean { return this.parent.has(a) && this.parent.has(b) && this.find(a) === this.find(b); }
}

const JudgeSchema = z.object({
  verdicts: z.array(z.object({ index: z.number(), same: z.boolean() })).default([]),
});

const JUDGE_SYSTEM = `Tu dédoublonnes un graphe de connaissances de laboratoire. On te donne des PAIRES d'entités du MÊME type qui POURRAIENT désigner le même concept réel.
Pour chaque paire (repérée par son index), réponds same=true UNIQUEMENT si c'est indiscutablement la MÊME entité du monde réel.
Exemples : « quizartinib concentration » ⟷ « dose de quizartinib » = true ; « quizartinib » ⟷ « sorafenib » = false ; « temps de trypsination » ⟷ « temps d'incubation » = false.
Sois CONSERVATEUR : dans le doute, same=false. Ne fusionne jamais deux choses distinctes.`;

async function judgePairs(pairs: Array<[KgEntity, KgEntity]>): Promise<Array<{ index: number; same: boolean }>> {
  const desc = (e: KgEntity) => `"${e.label}"${e.aliases.length ? ` (alias: ${e.aliases.join(", ")})` : ""}`;
  const lines = pairs.map(([a, b], i) => `${i}. [${a.type}] ${desc(a)}  ⟷  ${desc(b)}`);
  const out = await generateObjectFor("protocol", {
    system: JUDGE_SYSTEM,
    prompt: `Paires (recopie l'index de chacune) :\n${lines.join("\n")}`,
    schema: JudgeSchema,
  });
  return out.verdicts;
}

/** Scanne le registre kg_node et fusionne les doublons. La fusion ne se fait
 *  qu'AU SEIN d'un même type (un réactif avec un réactif). Best-effort côté IA :
 *  sans clé, seul le Tier 1 déterministe s'applique. */
export async function consolidateGraph(db: Db, ws: Ws): Promise<ConsolidationReport> {
  assertEnabled("knowledgeGraph");
  const entities = await db.listKgEntities(ws);
  const id = (e: KgEntity) => `${e.type}:${e.key}`;
  const byId = new Map(entities.map((e) => [id(e), e]));
  const dsu = new DSU();
  for (const e of entities) dsu.add(id(e));

  // Tier 1 — même forme compacte (déterministe, sûr, sans IA).
  const tight = new Map<string, string[]>();
  for (const e of entities) {
    const gk = `${e.type}:${foldTight(e.label)}`;
    const arr = tight.get(gk);
    if (arr) arr.push(id(e)); else tight.set(gk, [id(e)]);
  }
  for (const ids of tight.values()) for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);

  // Tier 2 — token significatif partagé, non déjà fusionné → juge LLM.
  const byType = new Map<string, KgEntity[]>();
  for (const e of entities) { const a = byType.get(e.type); if (a) a.push(e); else byType.set(e.type, [e]); }
  const pairs: Array<[KgEntity, KgEntity]> = [];
  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (dsu.connected(id(list[i]), id(list[j]))) continue;
        if (shareToken(list[i], list[j])) pairs.push([list[i], list[j]]);
      }
    }
  }
  let llmUsed = false;
  if (pairs.length && hasLlmKey()) {
    llmUsed = true;
    const capped = pairs.slice(0, JUDGE_CAP);
    for (const v of await judgePairs(capped)) {
      const pair = capped[v.index];
      if (v.same && pair) dsu.union(id(pair[0]), id(pair[1]));
    }
  }

  // Matérialise les groupes (>1) et fusionne.
  const groups = new Map<string, string[]>();
  for (const key of byId.keys()) {
    const root = dsu.find(key);
    const arr = groups.get(root);
    if (arr) arr.push(key); else groups.set(root, [key]);
  }
  const merges: Merge[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const members = ids.map((k) => byId.get(k)!).filter(Boolean);
    const survivor = pickSurvivor(members);
    const losers = members.filter((m) => m !== survivor);
    // Union des alias (labels + alias des perdants) dans le survivant.
    const aliases = [...new Set(members.flatMap((m) => [m.label, ...m.aliases]))].filter((a) => a !== survivor.label);
    await db.upsertKgEntity({
      ws, type: survivor.type, key: survivor.key, label: survivor.label, aliases,
      attrs: survivor.attrs, provenance: survivor.provenance, confidence: survivor.confidence,
    });
    for (const l of losers) await db.mergeKgEntity(ws, survivor.type, survivor.key, l.key);
    merges.push({ type: survivor.type, survivor: survivor.key, survivorLabel: survivor.label, merged: losers.map((l) => l.key) });
  }
  return { merges, candidatesConsidered: pairs.length, llmUsed };
}

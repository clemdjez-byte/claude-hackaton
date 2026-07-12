// lib/retrieval/knowledge-graph/resolve.ts — réconciliation + écriture de
// l'ontologie ouverte. Prend la sortie brute d'extractOpenGraph (entités +
// triplets, avec des ids temporaires) et :
//  1) réconcilie chaque entité contre le registre canonique kg_node (match par
//     clé/label/alias → réutilise ; sinon crée) — c'est le garde-fou anti-doublon
//     qui empêche « temp » et « température » de devenir deux nœuds ;
//  2) « épingle » les facettes qui ont déjà une ligne ailleurs (run/protocol) sur
//     leur id réel, pour connecter le graphe ouvert au noyau (pas de kg_node créé) ;
//  3) écrit les triplets (relations libres) comme arêtes kg_edge ;
//  4) garantit que chaque entité extraite est reliée à l'ancre (run/protocole) —
//     sinon elle serait inatteignable depuis les hits RAG et le chat ne la verrait pas.
import { assertEnabled, type Db, type Ws } from "@/lib/core";
import { link, type KgNode } from "./index";
import { canonicalKey, fold } from "./ontology";
import type { OpenGraph, KnownEntity } from "./extract";

const KNOWN_CAP = 80; // borne du bloc « ENTITÉS CONNUES » injecté au prompt
const OPEN_CONFIDENCE = 0.8; // confiance des nœuds/arêtes issus de l'IA

/** Charge les entités connues (registre kg_node + vocabulaire de paramètres) à
 *  montrer à l'IA pour qu'elle réutilise plutôt que de créer des doublons. Borné. */
export async function loadKnownEntities(db: Db, ws: Ws, opts?: { cap?: number }): Promise<KnownEntity[]> {
  const [entities, params] = await Promise.all([db.listKgEntities(ws), db.listParameterTypes(ws)]);
  const known: KnownEntity[] = [
    ...params.map((p) => ({ type: "parameter", key: p.key, label: p.label, aliases: p.aliases })),
    ...entities.map((e) => ({ type: e.type, key: e.key, label: e.label, aliases: e.aliases })),
  ];
  return known.slice(0, opts?.cap ?? KNOWN_CAP);
}

export interface ReconcileOpts {
  pins?: Record<string, string>; // facette → id réel (ex. { run: run.id, protocol: protocol.id })
  anchor?: KgNode; // nœud auquel rattacher les entités orphelines (connectivité)
  anchorRelation?: string; // relation d'ancrage (défaut "involves")
}

/** Réconcilie et écrit un graphe ouvert. Idempotent grâce à l'upsert kg_node et
 *  à la dédup d'arêtes (kg_edge) : ré-extraire le même texte ne duplique rien. */
export async function reconcileAndLink(db: Db, ws: Ws, g: OpenGraph, opts: ReconcileOpts = {}): Promise<void> {
  assertEnabled("knowledgeGraph");
  if (!g.entities.length) return;
  const pins = opts.pins ?? {};

  // Registre canonique par type : fold(clé | label | alias) → clé existante.
  const existing = await db.listKgEntities(ws);
  const canon = new Map<string, Map<string, string>>();
  const addCanon = (type: string, s: string, key: string) => {
    let m = canon.get(type);
    if (!m) { m = new Map(); canon.set(type, m); }
    if (!m.has(fold(s))) m.set(fold(s), key);
  };
  for (const e of existing) {
    addCanon(e.type, e.key, e.key);
    addCanon(e.type, e.label, e.key);
    for (const a of e.aliases) addCanon(e.type, a, e.key);
  }
  const priorByKey = new Map(existing.map((e) => [`${e.type}:${e.key}`, e]));

  // Résout chaque entité → nœud canonique. Les facettes épinglées prennent l'id
  // réel (elles ont déjà une ligne ailleurs → aucun kg_node créé).
  const resolved = new Map<string, KgNode>();
  for (const ent of g.entities) {
    if (pins[ent.type]) {
      resolved.set(ent.id, { type: ent.type, id: pins[ent.type] });
      continue;
    }
    const m = canon.get(ent.type);
    const key =
      m?.get(fold(ent.label)) ??
      m?.get(fold(canonicalKey(ent.type, ent.label))) ??
      canonicalKey(ent.type, ent.label);
    const prior = priorByKey.get(`${ent.type}:${key}`);
    const aliases = [...new Set([...(prior?.aliases ?? []), ent.label, ...ent.aliases])];
    const attrs = ent.value != null ? { value: ent.value, unit: ent.unit ?? "" } : undefined;
    await db.upsertKgEntity({ ws, type: ent.type, key, label: ent.label, aliases, attrs, provenance: "extracted", confidence: OPEN_CONFIDENCE });
    addCanon(ent.type, ent.label, key); // pour les entités suivantes du même lot
    resolved.set(ent.id, { type: ent.type, id: key });
  }

  const sameNode = (a: KgNode, b: KgNode) => a.type === b.type && a.id === b.id;

  // Écrit les triplets (deux extrémités résolues, pas de boucle) ; note qui touche
  // l'ancre pour ne pas re-rattacher inutilement.
  const touchesAnchor = new Set<string>();
  for (const t of g.triplets) {
    const from = resolved.get(t.subject);
    const to = resolved.get(t.object);
    if (!from || !to || sameNode(from, to)) continue;
    await link(db, ws, from, t.relation, to, { provenance: "extracted", confidence: OPEN_CONFIDENCE });
    if (opts.anchor) {
      if (sameNode(from, opts.anchor)) touchesAnchor.add(t.object);
      if (sameNode(to, opts.anchor)) touchesAnchor.add(t.subject);
    }
  }

  // Filet de connectivité : rattache à l'ancre toute entité extraite qui n'y est
  // pas déjà reliée, pour qu'elle reste atteignable depuis les hits RAG du chat.
  if (opts.anchor) {
    const rel = opts.anchorRelation ?? "involves";
    for (const [tempId, node] of resolved) {
      if (sameNode(node, opts.anchor) || touchesAnchor.has(tempId)) continue;
      await link(db, ws, opts.anchor, rel, node, { provenance: "extracted", confidence: OPEN_CONFIDENCE });
    }
  }
}

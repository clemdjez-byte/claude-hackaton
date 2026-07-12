// lib/live-experiment/features/knowledge-graph/query.ts — voie GRAPHE du chat.
// À partir de nœuds d'ancrage (les hits du RAG), agrège des FAITS structurés,
// chiffrés et sourçables : pour chaque run, ses paramètres + verdict + les
// FailureModes attribués ; et les facteurs d'échec PARTAGÉS entre protocoles
// (via les hubs ParameterType). renderGraphFacts en fait un bloc pour le prompt.
import { assertEnabled, type Db, type FailureMode, type Id, type ThresholdOperator, type Verdict, type Ws } from "@/lib/core";
import { REL, type KgNode } from "./ontology";

export interface RunFact {
  runId: Id;
  protocolId: Id;
  verdict: Verdict;
  params: Array<{ key: string; value: number; unit: string }>;
  attributions: Array<{
    paramTypeKey?: string;
    mechanism: string;
    observed: number;
    unit: string;
    operator?: ThresholdOperator;
    threshold?: number;
    trigger?: string;
  }>;
}
export interface CrossProtocolFact {
  paramTypeKey: string;
  protocolIds: Id[];
  mechanism: string;
}
export interface GraphFacts {
  runs: RunFact[];
  crossProtocol: CrossProtocolFact[];
}

/** Résout la liste des runs concernés par les ancres (runs directs + runs des
 *  protocoles ancres). */
async function anchorRunIds(db: Db, ws: Ws, anchors: KgNode[]): Promise<Set<Id>> {
  const runIds = new Set<Id>();
  for (const a of anchors) {
    if (a.type === "run") runIds.add(a.id);
    if (a.type === "protocol") {
      // runs —INSTANCE_OF→ protocole (le protocole est la destination)
      const edges = await db.listEdges(ws, { relation: REL.instanceOf, toId: a.id });
      for (const e of edges) if (e.fromType === "run") runIds.add(e.fromId);
    }
  }
  return runIds;
}

/** Agrège les faits du graphe à partir des ancres. */
export async function collectGraphFacts(db: Db, ws: Ws, anchors: KgNode[]): Promise<GraphFacts> {
  assertEnabled("knowledgeGraph");
  const fmById = new Map<Id, FailureMode>((await db.listFailureModes(ws)).map((f) => [f.id, f]));
  const runIds = await anchorRunIds(db, ws, anchors);

  const runs: RunFact[] = [];
  for (const runId of runIds) {
    const outgoing = await db.listEdges(ws, { fromId: runId });
    const protocolId = outgoing.find((e) => e.relation === REL.instanceOf && e.fromType === "run")?.toId ?? "";
    const params = outgoing
      .filter((e) => e.relation === REL.hasValue)
      .map((e) => ({
        key: e.toId,
        value: Number((e.attrs as { value?: number } | undefined)?.value ?? NaN),
        unit: String((e.attrs as { unit?: string } | undefined)?.unit ?? ""),
      }));

    const outcome = await db.getOutcomeByRun(runId);
    const verdict: Verdict = outcome?.verdict ?? "partial";

    const attributions: RunFact["attributions"] = [];
    if (outcome) {
      const attrEdges = await db.listEdges(ws, { relation: REL.attributedTo, fromId: outcome.id });
      for (const ae of attrEdges) {
        const fm = fmById.get(ae.toId);
        if (!fm) continue;
        // ATTRIBUTED_TO peut pointer vers un FailureMode numérique (paramTypeKey/
        // operator/threshold) ou qualitatif (trigger, sans seuil) : on reflète
        // simplement les champs réellement présents sur le FailureMode.
        attributions.push({
          paramTypeKey: fm.paramTypeKey,
          mechanism: fm.mechanism,
          observed: Number((ae.attrs as { observed?: number } | undefined)?.observed ?? NaN),
          unit: String((ae.attrs as { unit?: string } | undefined)?.unit ?? fm.unit ?? ""),
          operator: fm.operator,
          threshold: fm.threshold,
          trigger: fm.trigger,
        });
      }
    }
    // Un run sans Outcome ET sans paramètre chiffré n'apporte rien au graphe
    // (ex. un hit RAG sur un run hors-scope KG) : on l'exclut pour ne pas
    // polluer le prompt d'une ligne « verdict partial ; aucun paramètre ».
    if (outcome !== null || params.length > 0) {
      runs.push({ runId, protocolId, verdict, params, attributions });
    }
  }

  // Croisement inter-protocoles : pour chaque paramType attribué à un échec dans
  // la portée, quels protocoles (globalement) déclarent un FailureMode dessus.
  const crossProtocol: CrossProtocolFact[] = [];
  const attributedKeys = new Set(
    runs.flatMap((r) => r.attributions.map((a) => a.paramTypeKey).filter((k): k is string => k != null))
  );
  for (const key of attributedKeys) {
    const fms = await db.listFailureModes(ws, { paramTypeKey: key });
    const protocolIds = [...new Set(fms.map((f) => f.protocolId))];
    if (protocolIds.length >= 2) {
      crossProtocol.push({ paramTypeKey: key, protocolIds, mechanism: fms[0].mechanism });
    }
  }

  return { runs, crossProtocol };
}

/** Bloc texte compact pour le prompt : chiffré, sourçable, agrégé. */
export function renderGraphFacts(facts: GraphFacts): string {
  if (facts.runs.length === 0) return "(Aucun fait de graphe pour ces entités.)";
  const lines: string[] = [];
  for (const r of facts.runs) {
    const params = r.params.map((p) => `${p.key}=${p.value}${p.unit}`).join(", ") || "aucun paramètre";
    lines.push(`[run:${r.runId}] protocole [protocol:${r.protocolId}] — verdict ${r.verdict} ; ${params}`);
    for (const a of r.attributions) {
      if (a.operator != null && a.threshold != null) {
        lines.push(
          `  ↳ cause : ${a.paramTypeKey} ${a.observed}${a.unit} viole le seuil ${a.operator}${a.threshold}${a.unit} → ${a.mechanism}`
        );
      } else {
        lines.push(`  ↳ cause : ${a.trigger ?? a.paramTypeKey ?? "?"} → ${a.mechanism}`);
      }
    }
  }
  for (const c of facts.crossProtocol) {
    lines.push(
      `[cross] ${c.paramTypeKey} associé à des échecs dans plusieurs protocoles : ${c.protocolIds
        .map((id) => `[protocol:${id}]`)
        .join(", ")} — ${c.mechanism}`
    );
  }
  return lines.join("\n");
}

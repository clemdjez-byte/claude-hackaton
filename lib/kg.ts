// lib/kg.ts — couture hôte du KG, miroir de lib/rag.ts. Best-effort partout.
import { isEnabled } from "@/lib/core";
import type { Db, Outcome, Protocol, Run, Step } from "@/lib/core";
import { getReport, listEvidence } from "@/lib/bench";
import { link } from "@/lib/retrieval/knowledge-graph";
import { NODE, REL } from "@/lib/retrieval/knowledge-graph/ontology";
import { extractProtocolOntology, extractRunOntology } from "@/lib/retrieval/knowledge-graph/extract";

async function safe(label: string, run: () => Promise<unknown>): Promise<void> {
  try { await run(); } catch (e) {
    console.warn(`[kg] indexation "${label}" a échoué (best-effort, action non bloquée) :`, e);
  }
}

/** À la publication : extraction IA de l'ontologie du protocole. CITES reste
 *  déterministe (protocol.sources est un champ propre, pas un fardeau de format). */
export async function indexProtocolGraph(db: Db, protocol: Protocol): Promise<void> {
  if (!isEnabled("knowledgeGraph")) return;
  await safe("protocol-graph", async () => {
    const ws = protocol.ws;
    for (const s of protocol.sources ?? []) {
      await link(db, ws, NODE.protocol(protocol.id), REL.cites, NODE.publication(s.ref), { provenance: "extracted" });
    }
    const { parameterTypes, reagents, cellLines, failureModes } = await extractProtocolOntology(protocol);
    for (const pt of parameterTypes) {
      await db.upsertParameterType({ ws, key: pt.key, label: pt.label, unit: pt.unit, aliases: pt.aliases });
      await link(db, ws, NODE.protocol(protocol.id), REL.usesParam, NODE.parameterType(pt.key), { provenance: "extracted" });
    }
    for (const r of reagents) await link(db, ws, NODE.protocol(protocol.id), REL.uses, NODE.reagent(r), { provenance: "extracted" });
    for (const cl of cellLines) await link(db, ws, NODE.protocol(protocol.id), REL.uses, NODE.cellLine(cl), { provenance: "extracted" });
    for (const fm of failureModes) {
      const row = await db.insertFailureMode({
        ws, protocolId: protocol.id, paramTypeKey: fm.paramTypeKey, operator: fm.operator,
        threshold: fm.threshold, unit: fm.unit, trigger: fm.trigger, verdict: fm.verdict, mechanism: fm.mechanism,
      });
      await link(db, ws, NODE.protocol(protocol.id), REL.declares, NODE.failureMode(row.id), { provenance: "extracted" });
      if (fm.paramTypeKey) await link(db, ws, NODE.failureMode(row.id), REL.about, NODE.parameterType(fm.paramTypeKey), { provenance: "extracted" });
    }
  });
}

/** À la clôture + verdict : extraction IA du run (rapport + preuves) → arêtes. */
export async function indexRunGraph(db: Db, run: Run, _steps: Step[], protocol: Protocol, outcome: Outcome): Promise<void> {
  if (!isEnabled("knowledgeGraph")) return;
  await safe("run-graph", async () => {
    const ws = run.ws;
    const report = await getReport(db, run.id).catch(() => null);
    const evidence = await listEvidence(db, run.id);
    const ex = await extractRunOntology(run, protocol, report, evidence);

    await link(db, ws, NODE.run(run.id), REL.instanceOf, NODE.protocol(protocol.id), { provenance: "extracted" });
    for (const pv of ex.paramValues)
      await link(db, ws, NODE.run(run.id), REL.hasValue, NODE.parameterType(pv.key), { provenance: "extracted", attrs: { value: pv.value, unit: pv.unit } });
    for (const r of ex.reagents) await link(db, ws, NODE.run(run.id), REL.uses, NODE.reagent(r), { provenance: "extracted" });
    for (const cl of ex.cellLines) await link(db, ws, NODE.run(run.id), REL.uses, NODE.cellLine(cl), { provenance: "extracted" });
    await link(db, ws, NODE.run(run.id), REL.resultedIn, NODE.outcome(outcome.id), { provenance: "extracted" });

    if (outcome.verdict !== "success") {
      for (const c of ex.causes) {
        // cause du chercheur → FailureMode (créé à la volée, non déclaré) + attribution
        const fm = await db.insertFailureMode({
          ws, protocolId: protocol.id, paramTypeKey: c.paramTypeKey, trigger: c.trigger,
          verdict: c.verdict, mechanism: c.mechanism,
        });
        await link(db, ws, NODE.outcome(outcome.id), REL.attributedTo, NODE.failureMode(fm.id), { provenance: "extracted", attrs: { mechanism: c.mechanism } });
      }
    }
  });
}

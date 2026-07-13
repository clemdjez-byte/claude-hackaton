// lib/kg.ts — couture hôte du KG, miroir de lib/rag.ts. Best-effort partout.
import { isEnabled } from "@/lib/core";
import type { Db, Protocol, Run, Step } from "@/lib/core";
import { getReport, listEvidence } from "@/lib/bench";
import { link } from "@/lib/retrieval/knowledge-graph";
import { NODE, REL } from "@/lib/retrieval/knowledge-graph/ontology";
import {
  extractProtocolOntology,
  extractRunOntology,
  extractProtocolOpenGraph,
  extractRunOpenGraph,
} from "@/lib/retrieval/knowledge-graph/extract";
import { loadKnownEntities, reconcileAndLink } from "@/lib/retrieval/knowledge-graph/resolve";

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

    // Ontologie ouverte : l'IA crée les nœuds objectifs du protocole (matériel,
    // équipement…). Épinglé au protocole réel + rattachement pour l'atteignabilité.
    const known = await loadKnownEntities(db, ws);
    const og = await extractProtocolOpenGraph(protocol, known);
    await reconcileAndLink(db, ws, og, {
      pins: { protocol: protocol.id },
      anchor: NODE.protocol(protocol.id),
      anchorRelation: "mentions",
    });
  });
}

/** À la signature du rapport (D4) : l'IA lit le texte signé + les preuves et bâtit
 *  le graphe du run. Le verdict est EXTRAIT du texte (plus saisi) : on ne crée
 *  l'Outcome que s'il y est écrit. Best-effort (ne bloque jamais la signature). */
export async function indexRunGraph(db: Db, run: Run, _steps: Step[], protocol: Protocol): Promise<void> {
  if (!isEnabled("knowledgeGraph")) return;
  await safe("run-graph", async () => {
    const ws = run.ws;
    const report = await getReport(db, run.id).catch(() => null);
    const evidence = await listEvidence(db, run.id);
    const ex = await extractRunOntology(run, protocol, report, evidence);

    // Noyau chiffré : structure du run (paramètres appliqués, réactifs, lignées).
    await link(db, ws, NODE.run(run.id), REL.instanceOf, NODE.protocol(protocol.id), { provenance: "extracted" });
    // Rattache le rapport à son expérience : le rapport est produit après le run
    // (generateReport tourne avant indexRunGraph), on matérialise le lien.
    if (report) await link(db, ws, NODE.run(run.id), REL.producedReport, NODE.report(report.id), { provenance: "derived" });
    for (const pv of ex.paramValues)
      await link(db, ws, NODE.run(run.id), REL.hasValue, NODE.parameterType(pv.key), { provenance: "extracted", attrs: { value: pv.value, unit: pv.unit } });
    for (const r of ex.reagents) await link(db, ws, NODE.run(run.id), REL.uses, NODE.reagent(r), { provenance: "extracted" });
    for (const cl of ex.cellLines) await link(db, ws, NODE.run(run.id), REL.uses, NODE.cellLine(cl), { provenance: "extracted" });

    // Verdict : réutilise un Outcome déjà enregistré pour ce run s'il existe (ex.
    // seed de démo, ou re-signature), sinon celui LU dans le rapport (D4 — voie
    // /sign). Aucun Outcome si le texte ne dit rien du résultat. Réutiliser
    // l'existant rend la re-signature idempotente côté verdict.
    const existing = await db.getOutcomeByRun(run.id);
    const verdict = existing?.verdict ?? ex.verdict;
    if (verdict) {
      const outcome = existing ?? (await db.insertOutcome({ ws, runId: run.id, verdict }));
      await link(db, ws, NODE.run(run.id), REL.resultedIn, NODE.outcome(outcome.id), { provenance: "extracted" });
      if (verdict !== "success") {
        for (const c of ex.causes) {
          // cause écrite par le chercheur → FailureMode (créé à la volée) + attribution
          const fm = await db.insertFailureMode({
            ws, protocolId: protocol.id, paramTypeKey: c.paramTypeKey, trigger: c.trigger,
            verdict: c.verdict, mechanism: c.mechanism,
          });
          await link(db, ws, NODE.outcome(outcome.id), REL.attributedTo, NODE.failureMode(fm.id), { provenance: "extracted", attrs: { mechanism: c.mechanism } });
        }
      }
    }

    // Ontologie ouverte : l'IA lit le rapport et crée les nœuds objectifs
    // (instrument, opérateur, échantillon, date…). Épinglé au run/protocole réels.
    const known = await loadKnownEntities(db, ws);
    const og = await extractRunOpenGraph(protocol, report, evidence, known);
    await reconcileAndLink(db, ws, og, {
      pins: { run: run.id, protocol: protocol.id },
      anchor: NODE.run(run.id),
      anchorRelation: "involves",
    });
  });
}

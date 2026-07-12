// lib/rag.ts — couture hôte : indexation de la mémoire sémantique du lab +
// liens du graphe de connaissances (galaxie). Centralise les appels à
// indexEntry / link (lib/retrieval) pour que les actions/routes restent
// lisibles.
//
// Best-effort partout : une indexation ou un lien qui échoue (flag désactivé,
// texte vide, erreur de stockage…) ne doit JAMAIS faire échouer l'action
// utilisateur qui vient de réussir (note capturée, protocole figé, run
// terminé…). On avale l'erreur et on logge un warning côté serveur.
import { indexEntry, link } from "@/lib/retrieval";
import type { Db, Evidence, Id, Protocol, Run, Step } from "@/lib/core";
import { WS } from "@/lib/session";

async function safeguard(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.warn(`[rag] "${label}" a échoué (best-effort, action non bloquée) :`, e);
  }
}

function evidenceText(e: Evidence): string {
  switch (e.kind) {
    case "note":
      return e.body ?? "Note vide.";
    case "measurement":
      return e.body ?? (e.measurement ? `${e.measurement.value} ${e.measurement.unit}` : "Mesure.");
    case "deviation":
      if (!e.deviation) return "Déviation.";
      return `Déviation (${e.deviation.severity}) : prévu « ${e.deviation.expected} », réalisé « ${e.deviation.actual} »${e.deviation.reason ? ` — ${e.deviation.reason}` : ""}.`;
    case "photo":
      return `Photo${e.body ? ` : ${e.body}` : "."}`;
    case "data":
      return `Fichier de données${e.body ? ` : ${e.body}` : "."}`;
    default:
      return e.body ?? "";
  }
}

/** Indexe une preuve (note, mesure, déviation, photo, fichier de données)
 *  juste après sa capture réussie. */
export async function indexEvidence(db: Db, e: Evidence): Promise<void> {
  await safeguard("evidence", () =>
    indexEntry(db, {
      ws: WS,
      sourceType: "evidence",
      sourceId: e.id,
      text: evidenceText(e),
      meta: { runId: e.runId, kind: e.kind },
    })
  );
}

/** Indexe un protocole publié ou figé (titre + étapes). */
export async function indexProtocol(db: Db, p: Protocol): Promise<void> {
  await safeguard("protocol", () =>
    indexEntry(db, {
      ws: WS,
      sourceType: "protocol",
      sourceId: p.id,
      text: [
        p.title,
        p.summary,
        ...p.steps.map((s) => `${s.index + 1}. ${s.title} — ${s.instruction}`),
      ]
        .filter(Boolean)
        .join("\n"),
      meta: { version: p.version, status: p.status },
    })
  );
}

/** Indexe un run terminé : titre du protocole, résumé des étapes, période. */
export async function indexRun(
  db: Db,
  run: Run,
  protocolTitle: string,
  steps: Step[]
): Promise<void> {
  await safeguard("run", () => {
    const done = steps.filter((s) => s.status === "done").length;
    const skipped = steps.filter((s) => s.status === "skipped").length;
    const text = [
      `Run de « ${protocolTitle} » — ${run.status}.`,
      `${done}/${steps.length} étapes faites, ${skipped} sautée(s).`,
      `Période : ${run.startedAt} → ${run.endedAt ?? "en cours"}.`,
    ].join("\n");
    return indexEntry(db, {
      ws: WS,
      sourceType: "run",
      sourceId: run.id,
      text,
      meta: { protocolId: run.protocolId, status: run.status },
    });
  });
}

/** Indexe un rapport généré. `text` = markdown du rapport (exportReportMarkdown). */
export async function indexReport(
  db: Db,
  report: { id: Id; runId: Id },
  text: string
): Promise<void> {
  await safeguard("report", () =>
    indexEntry(db, {
      ws: WS,
      sourceType: "report",
      sourceId: report.id,
      text,
      meta: { runId: report.runId },
    })
  );
}

// ── Liens du graphe de connaissances (galaxie) ─────────────────────────────
// Vocabulaire de relations documenté sur KgEdge.relation (lib/core/types.ts) :
// uses_reagent | ran_protocol | derived_from | measured_with | produced_report.

/** Lie un run tout juste démarré au protocole (figé) dont il dérive. */
export async function linkRunToProtocol(db: Db, runId: Id, protocolId: Id): Promise<void> {
  await safeguard("link run→protocol", () =>
    link(db, WS, { type: "run", id: runId }, "derived_from", { type: "protocol", id: protocolId })
  );
}

/** Lie un rapport tout juste généré au run qui l'a produit. */
export async function linkReportToRun(db: Db, reportId: Id, runId: Id): Promise<void> {
  await safeguard("link report→run", () =>
    link(db, WS, { type: "run", id: runId }, "produced_report", { type: "report", id: reportId })
  );
}

// features/auto-report/index.ts — Brique 5.
// Responsabilité unique : reconstruire un run en rapport STRUCTURÉ et SOURCÉ.
// Contrat de rigueur : les chiffres viennent des faits (scaling déterministe +
// mesures d'evidence), JAMAIS du LLM. Le LLM ne rédige que l'interprétation,
// étiquetée comme telle. Chaque affirmation d'observation cite une evidence.
import {
  assertEnabled,
  generateObjectFor,
  hasLlmKey,
  type Db,
  type Evidence,
  type Id,
  type Page,
  type ReportContent,
  type ReportCitation,
} from "@/lib/core";
import { z } from "zod";
import { getRunContext, type RunContext } from "@/features/live-bench";
import { listEvidence } from "@/features/evidence-capture";

export interface StoredReport {
  id: Id; // id de la page report
  runId: Id;
  protocolTitle: string;
  generatedAt: string;
  content: ReportContent;
}

type ReportPageContent = { runId: Id; protocolTitle: string; generatedAt: string } & ReportContent;

const NarrativeSchema = z.object({
  interpretation: z
    .string()
    .describe("interprétation prudente et étiquetée ; ne t'appuie que sur les faits fournis ; n'invente AUCUN chiffre"),
  openQuestions: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export async function generateReport(db: Db, runId: Id): Promise<StoredReport> {
  assertEnabled("autoReport");
  const ctx = await getRunContext(db, runId);
  if (!ctx) throw new Error(`Run introuvable : ${runId}`);
  const evidence = await listEvidence(db, runId);

  const planned = buildPlanned(ctx);
  const performed = buildPerformed(ctx, evidence);
  const observed = buildObserved(evidence);
  const deviations = buildDeviations(evidence);
  const citations = buildCitations(evidence);

  const narrative = await buildNarrative({ ctx, planned, performed, observed, deviations });

  const content: ReportContent = {
    objective: ctx.protocol.summary ?? ctx.protocol.title,
    planned,
    performed,
    observed,
    interpretation: narrative.interpretation,
    deviations,
    openQuestions: narrative.openQuestions,
    nextActions: narrative.nextActions,
    citations,
  };

  const pageContent: ReportPageContent = {
    runId,
    protocolTitle: ctx.protocol.title,
    generatedAt: new Date().toISOString(),
    ...content,
  };
  const page = await db.insertPage({
    ws: ctx.run.ws,
    type: "report",
    title: `Rapport — ${ctx.protocol.title}`,
    content: pageContent,
  });
  return toStored(page);
}

export async function getReport(db: Db, runId: Id): Promise<StoredReport | null> {
  assertEnabled("autoReport");
  const ctx = await db.getRun(runId);
  if (!ctx) return null;
  const pages = await db.listPages(ctx.ws, { type: "report", latestOnly: true });
  const match = pages
    .map(toStored)
    .filter((r) => r.runId === runId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  return match ?? null;
}

export async function exportReportMarkdown(db: Db, runId: Id): Promise<string> {
  assertEnabled("autoReport");
  const report = (await getReport(db, runId)) ?? (await generateReport(db, runId));
  return renderMarkdown(report);
}

// ── Assemblage déterministe des faits ──────────────────────────────────
function buildPlanned(ctx: RunContext): string {
  const lines: string[] = [];
  const n = ctx.run.scalingContext.n_reactions ?? "?";
  const over = ctx.run.scalingContext.overage_pct ?? "?";
  lines.push(`${ctx.protocol.steps.length} étapes prévues, protocole figé v${ctx.protocol.version}.`);
  if (ctx.scaledRecipe) {
    lines.push(
      `Master mix pour ${n} réactions (excès ${over} %) — valeurs calculées par code déterministe :`
    );
    for (const c of ctx.scaledRecipe.components.filter((x) => x.shared)) {
      lines.push(`  · ${c.name} : ${c.total.value} ${c.total.unit}`);
    }
    lines.push(`  · Total mix partagé : ${ctx.scaledRecipe.sharedTotal.value} ${ctx.scaledRecipe.sharedTotal.unit} (réserve morte ${ctx.scaledRecipe.deadVolume.value} ${ctx.scaledRecipe.deadVolume.unit}).`);
  }
  return lines.join("\n");
}

function buildPerformed(ctx: RunContext, evidence: Evidence[]): string {
  const lines: string[] = [];
  for (const s of ctx.steps) {
    const dur = stepDurationMin(s.startedAt, s.completedAt);
    const durTxt = dur != null ? ` — ${dur} min` : "";
    lines.push(`Étape ${s.protocolStepIndex} « ${s.title} » : ${statusFr(s.status)}${durTxt}.`);
  }
  const measurements = evidence.filter((e) => e.kind === "measurement");
  if (measurements.length) {
    lines.push("Mesures relevées :");
    for (const m of measurements)
      lines.push(`  · ${m.body ?? "mesure"} = ${m.measurement?.value} ${m.measurement?.unit} [${m.id}]`);
  }
  return lines.join("\n");
}

function buildObserved(evidence: Evidence[]): string {
  const notes = evidence.filter((e) => e.kind === "note");
  const photos = evidence.filter((e) => e.kind === "photo");
  const lines: string[] = [];
  for (const nn of notes) lines.push(`Note : ${nn.body} [${nn.id}]`);
  for (const p of photos) lines.push(`Photo${p.body ? ` (${p.body})` : ""} [${p.id}]`);
  if (lines.length === 0) lines.push("Aucune observation qualitative enregistrée.");
  return lines.join("\n");
}

function buildDeviations(evidence: Evidence[]): string[] {
  return evidence
    .filter((e) => e.kind === "deviation" && e.deviation)
    .map((e) => {
      const d = e.deviation!;
      const reason = d.reason ? ` — ${d.reason}` : "";
      return `[${severityFr(d.severity)}] prévu « ${d.expected} », réalisé « ${d.actual} »${reason} [${e.id}]`;
    });
}

function buildCitations(evidence: Evidence[]): ReportCitation[] {
  return evidence.map((e) => ({
    claim: claimForEvidence(e),
    evidenceIds: [e.id],
  }));
}

async function buildNarrative(args: {
  ctx: RunContext;
  planned: string;
  performed: string;
  observed: string;
  deviations: string[];
}): Promise<z.infer<typeof NarrativeSchema>> {
  const { planned, performed, observed, deviations } = args;
  if (!hasLlmKey()) {
    // Repli déterministe (hors-ligne) : jamais de chiffre inventé.
    const crit = deviations.filter((d) => d.startsWith("[critique")).length;
    return {
      interpretation:
        deviations.length === 0
          ? "Aucune déviation enregistrée. Résultats à valider par l'opérateur (interprétation automatique, non-experte)."
          : `${deviations.length} déviation(s) enregistrée(s)${crit ? `, dont ${crit} critique(s)` : ""}. À examiner avant toute conclusion. (Interprétation automatique, à valider.)`,
      openQuestions:
        deviations.length > 0
          ? ["Les déviations critiques compromettent-elles la quantification ?"]
          : ["Les contrôles (NTC, réplicats) sont-ils conformes ?"],
      nextActions: ["Valider le rapport", "Vérifier les contrôles qualité (NTC, melt curve, réplicats)"],
    };
  }
  return generateObjectFor("report", {
    system: `Tu rédiges l'INTERPRÉTATION d'un run de laboratoire, en français, ton de chercheur senior.
Règles absolues :
- Ne t'appuie que sur les FAITS fournis ci-dessous. N'invente AUCUN chiffre, aucune mesure, aucune source.
- Étiquette clairement qu'il s'agit d'une interprétation à valider par un humain.
- Sois prudent et concis. Distingue observation et hypothèse.`,
    prompt: `FAITS DU RUN :

## Prévu
${planned}

## Réellement fait
${performed}

## Observé
${observed}

## Déviations
${deviations.length ? deviations.join("\n") : "aucune"}

Produis: interpretation (prose), openQuestions (questions ouvertes), nextActions (prochaines actions).`,
    schema: NarrativeSchema,
  });
}

// ── Rendu markdown ──────────────────────────────────────────────────────
function renderMarkdown(r: StoredReport): string {
  const c = r.content;
  const section = (title: string, body: string) => `## ${title}\n\n${body}\n`;
  return [
    `# Rapport — ${r.protocolTitle}`,
    `_Généré le ${r.generatedAt} · run ${r.runId}_\n`,
    `> Prévu / réellement fait / observé / interprété — chaque observation est sourcée.\n`,
    section("Objectif", c.objective),
    section("Prévu", c.planned),
    section("Réellement fait", c.performed),
    section("Observé", c.observed),
    section("Déviations", c.deviations.length ? c.deviations.map((d) => `- ${d}`).join("\n") : "Aucune."),
    section("Interprétation (à valider)", c.interpretation),
    section("Questions ouvertes", c.openQuestions.map((q) => `- ${q}`).join("\n") || "—"),
    section("Prochaines actions", c.nextActions.map((a) => `- ${a}`).join("\n") || "—"),
    section("Annexe — citations", c.citations.map((ci) => `- « ${ci.claim} » → ${ci.evidenceIds.join(", ")}`).join("\n") || "—"),
  ].join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────
function toStored(page: Page): StoredReport {
  const c = page.content as ReportPageContent;
  const { runId, protocolTitle, generatedAt, ...content } = c;
  return { id: page.id, runId, protocolTitle, generatedAt, content };
}

function stepDurationMin(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round((ms / 60000) * 10) / 10;
}
function statusFr(s: string): string {
  return { pending: "en attente", active: "en cours", done: "faite", skipped: "sautée" }[s] ?? s;
}
function severityFr(s: string): string {
  return { minor: "mineure", major: "majeure", critical: "critique" }[s] ?? s;
}
function claimForEvidence(e: Evidence): string {
  if (e.kind === "deviation" && e.deviation) return `déviation : ${e.deviation.actual}`;
  if (e.kind === "measurement" && e.measurement) return `${e.body ?? "mesure"} = ${e.measurement.value} ${e.measurement.unit}`;
  if (e.kind === "photo") return e.body ?? "photo";
  return e.body ?? "note";
}

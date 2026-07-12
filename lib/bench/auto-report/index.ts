// lib/bench/auto-report/index.ts — Brique 5.
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
} from "@/lib/core";
import { z } from "zod";
import { getRunContext, type RunContext } from "../live-bench";
import { listEvidence } from "../evidence-capture";

export interface StoredReport {
  id: Id; // id de la page report
  version: number; // version de page : draft = updateDraft en place, signature = newPageVersion figée
  runId: Id;
  protocolTitle: string;
  generatedAt: string;
  html: string; // document éditable (rendu initial des faits)
  signedAt?: string; // signature ELN (Task 3)
  signedBy?: string;
}

// Contenu stocké dans `Page.content` pour une page de type 'report' (id et
// version sont portés par la page elle-même, pas dupliqués dans le content).
type ReportPageMeta = Omit<StoredReport, "id" | "version">;

// Citation locale à la brique (pas de type stocké : les faits ne sont plus
// persistés qu'une fois rendus en HTML, cf. renderHtml).
interface Citation {
  claim: string;
  evidenceIds: Id[];
}

// Faits déterministes assemblés avant rendu (jamais stockés tels quels).
interface ReportFacts {
  objective: string;
  planned: string;
  performed: string;
  observed: string;
  interpretation: string;
  deviations: string[];
  openQuestions: string[];
  nextActions: string[];
  citations: Citation[];
}

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

  const facts: ReportFacts = {
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

  const protocolTitle = ctx.protocol.title;
  const generatedAt = new Date().toISOString();
  const html = renderHtml({ protocolTitle, generatedAt, runId }, facts);

  const pageContent: ReportPageMeta = { runId, protocolTitle, generatedAt, html };
  const page = await db.insertPage({
    ws: ctx.run.ws,
    type: "report",
    title: `Rapport: ${protocolTitle}`,
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

/** Texte (markdown-ish) dérivé du document HTML — export + repli d'affichage. */
export async function exportReportMarkdown(db: Db, runId: Id): Promise<string> {
  assertEnabled("autoReport");
  const report = (await getReport(db, runId)) ?? (await generateReport(db, runId));
  return htmlToText(report.html);
}

// ── Assemblage déterministe des faits ──────────────────────────────────
function buildPlanned(ctx: RunContext): string {
  const lines: string[] = [];
  const n = ctx.run.scalingContext.n_reactions ?? "?";
  const over = ctx.run.scalingContext.overage_pct ?? "?";
  lines.push(`${ctx.protocol.steps.length} étapes prévues, protocole figé v${ctx.protocol.version}.`);
  if (ctx.scaledRecipe) {
    lines.push(
      `Master mix pour ${n} réactions (excès ${over} %), valeurs calculées par code déterministe :`
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
    const durTxt = dur != null ? ` (${dur} min)` : "";
    lines.push(`Étape ${s.protocolStepIndex + 1} « ${s.title} » : ${statusFr(s.status)}${durTxt}.`);
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
  const dataFiles = evidence.filter((e) => e.kind === "data");
  const lines: string[] = [];
  for (const nn of notes) lines.push(`Note : ${nn.body} [${nn.id}]`);
  for (const p of photos) lines.push(`Photo${p.body ? ` (${p.body})` : ""} [${p.id}]`);
  for (const d of dataFiles)
    lines.push(`Fichier de données : ${d.source?.label ?? d.body ?? "fichier"} [${d.id}]`);
  if (lines.length === 0) lines.push("Aucune observation qualitative enregistrée.");
  return lines.join("\n");
}

function buildDeviations(evidence: Evidence[]): string[] {
  return evidence
    .filter((e) => e.kind === "deviation" && e.deviation)
    .map((e) => {
      const d = e.deviation!;
      const reason = d.reason ? ` (${d.reason})` : "";
      return `[${severityFr(d.severity)}] prévu « ${d.expected} », réalisé « ${d.actual} »${reason} [${e.id}]`;
    });
}

function buildCitations(evidence: Evidence[]): Citation[] {
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
  // Repli déterministe : jamais de chiffre inventé. Utilisé sans clé LLM,
  // mais aussi si l'appel LLM échoue (clé invalide, réseau, quota…) — un
  // rapport sans interprétation rédigée vaut mieux que pas de rapport.
  const fallback = (): z.infer<typeof NarrativeSchema> => {
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
  };
  if (!hasLlmKey()) return fallback();
  try {
    return await generateObjectFor("report", {
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
  } catch {
    // L'appel LLM a échoué (clé invalide, réseau, quota…) : on retombe sur le
    // repli déterministe plutôt que de perdre tout le rapport.
    return fallback();
  }
}

// ── Rendu HTML (document Tiptap-compatible) ─────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bloc texte multi-lignes (les `\n` des build* deviennent des `<br>`). */
function textBlockHtml(text: string): string {
  return `<p>${text.split("\n").map(escapeHtml).join("<br>")}</p>`;
}

function listHtml(items: string[], empty: string): string {
  if (items.length === 0) return `<p>${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
}

function citationsHtml(citations: Citation[]): string {
  if (citations.length === 0) return "<p>Aucune.</p>";
  return `<ul>${citations
    .map((ci) => `<li>« ${escapeHtml(ci.claim)} » → ${escapeHtml(ci.evidenceIds.join(", "))}</li>`)
    .join("")}</ul>`;
}

function sectionHtml(title: string, bodyHtml: string): string {
  return `<h2>${escapeHtml(title)}</h2>\n${bodyHtml}`;
}

/** Même contenu que l'ancien renderMarkdown, mais en HTML éditable (Tiptap). */
function renderHtml(meta: { protocolTitle: string; generatedAt: string; runId: Id }, f: ReportFacts): string {
  return [
    `<h1>Rapport: ${escapeHtml(meta.protocolTitle)}</h1>`,
    `<p><em>Généré le ${escapeHtml(meta.generatedAt)} · run ${escapeHtml(meta.runId)}</em></p>`,
    `<blockquote><p>Prévu / réellement fait / observé / interprété. Chaque observation est sourcée.</p></blockquote>`,
    sectionHtml("Objectif", textBlockHtml(f.objective)),
    sectionHtml("Prévu", textBlockHtml(f.planned)),
    sectionHtml("Réellement fait", textBlockHtml(f.performed)),
    sectionHtml("Observé", textBlockHtml(f.observed)),
    sectionHtml("Déviations", listHtml(f.deviations, "Aucune.")),
    sectionHtml("Interprétation (à valider)", textBlockHtml(f.interpretation)),
    sectionHtml("Questions ouvertes", listHtml(f.openQuestions, "Aucune.")),
    sectionHtml("Prochaines actions", listHtml(f.nextActions, "Aucune.")),
    sectionHtml("Annexe: citations", citationsHtml(f.citations)),
  ].join("\n");
}

/** Texte lisible (markdown-ish) dérivé du HTML — suffisant pour l'export et
 *  l'indexation lab-memory (bag-of-words) ; pas un vrai parseur HTML. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n### ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    // Fermetures de blocs "reconnus" : liste explicite de tags de bloc, dont
    // les tags de table (cellules/lignes : l'éditeur permet maintenant d'en
    // insérer) — sans ça, "<td>A</td><td>B</td>" devient "AB" au lieu de deux
    // mots séparés.
    .replace(/<\/(h1|h2|h3|p|li|blockquote|div|table|thead|tbody|tfoot|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return decoded
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── helpers ──────────────────────────────────────────────────────────────
function toStored(page: Page): StoredReport {
  const c = page.content as ReportPageMeta;
  return { id: page.id, version: page.version, ...c };
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
  if (e.kind === "data") return `fichier de données : ${e.source?.label ?? e.body ?? "fichier"}`;
  return e.body ?? "note";
}

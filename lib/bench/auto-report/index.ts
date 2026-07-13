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
import { describePhotos } from "./describe-photos";

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
  result: string; // HTML de la section « Result » (images inline + mesures/notes)
  observed: string; // HTML de la section « Observed » (notes/data en texte, photos inline)
  interpretation: string;
  deviations: string[];
  openQuestions: string[];
  nextActions: string[];
  citations: Citation[];
}

const NarrativeSchema = z.object({
  interpretation: z
    .string()
    .describe("cautious, clearly-labeled interpretation; rely only on the facts provided; invent NO number"),
  openQuestions: z.array(z.string()),
  nextActions: z.array(z.string()),
});

export async function generateReport(db: Db, runId: Id): Promise<StoredReport> {
  assertEnabled("autoReport");
  const ctx = await getRunContext(db, runId);
  if (!ctx) throw new Error(`Run introuvable : ${runId}`);
  const evidence = await listEvidence(db, runId);

  // Étape « Results » du protocole figé → run step correspondant → son id. Sert
  // à isoler les preuves du « résultat » (section dédiée) du reste des observations.
  const resultProto = ctx.protocol.steps.find((s) => s.isResult) ?? null;
  const resultRunStep = resultProto
    ? ctx.steps.find((s) => s.protocolStepIndex === resultProto.index) ?? null
    : null;
  const resultStepId = resultRunStep?.id;

  // Description vision de TOUTES les photos du run (Results et autres étapes),
  // best-effort : embarquée dans le HTML via data-description, jamais bloquante.
  const stepTitles = new Map(ctx.steps.map((s) => [s.id, s.title]));
  const descriptions = await describePhotos(
    db,
    evidence
      .filter((e) => e.kind === "photo")
      .map((e) => ({ evidence: e, stepTitle: e.stepId ? stepTitles.get(e.stepId) : undefined }))
  );

  const planned = buildPlanned(ctx);
  const performed = buildPerformed(ctx, evidence, resultStepId);
  const result = buildResult(evidence, descriptions, resultStepId);
  const observed = buildObserved(evidence, descriptions, resultStepId);
  const deviations = buildDeviations(evidence);
  const citations = buildCitations(evidence);

  // Le LLM garde le contexte complet : on lui donne le résultat et l'observé en
  // texte (les images deviennent « [Photo: caption — description] »).
  const narrative = await buildNarrative({
    ctx,
    planned,
    performed,
    observed: htmlToText(observed),
    result: htmlToText(result),
    deviations,
  });

  const facts: ReportFacts = {
    objective: ctx.protocol.summary ?? ctx.protocol.title,
    planned,
    performed,
    result,
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
    title: `Report: ${protocolTitle}`,
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
  lines.push(`${ctx.protocol.steps.length} steps planned, protocol frozen at v${ctx.protocol.version}.`);
  if (ctx.scaledRecipe) {
    lines.push(
      `Master mix for ${n} reactions (overage ${over} %), values computed by deterministic code:`
    );
    for (const c of ctx.scaledRecipe.components.filter((x) => x.shared)) {
      lines.push(`  · ${c.name}: ${c.total.value} ${c.total.unit}`);
    }
    lines.push(`  · Shared mix total: ${ctx.scaledRecipe.sharedTotal.value} ${ctx.scaledRecipe.sharedTotal.unit} (dead volume ${ctx.scaledRecipe.deadVolume.value} ${ctx.scaledRecipe.deadVolume.unit}).`);
  }
  return lines.join("\n");
}

function buildPerformed(ctx: RunContext, evidence: Evidence[], resultStepId?: Id): string {
  const lines: string[] = [];
  for (const s of ctx.steps) {
    const dur = stepDurationMin(s.startedAt, s.completedAt);
    const durTxt = dur != null ? ` (${dur} min)` : "";
    lines.push(`Step ${s.protocolStepIndex + 1} "${s.title}": ${statusLabel(s.status)}${durTxt}.`);
  }
  // Les mesures de l'étape « Results » vivent dans la section Result.
  const measurements = evidence.filter((e) => e.kind === "measurement" && e.stepId !== resultStepId);
  if (measurements.length) {
    lines.push("Measurements recorded:");
    for (const m of measurements)
      lines.push(`  · ${m.body ?? "measurement"} = ${m.measurement?.value} ${m.measurement?.unit} [${m.id}]`);
  }
  return lines.join("\n");
}

/** Section « Observed » (HTML) : notes et fichiers data en blocs texte, photos
 *  en VRAIES images inline — le chercheur peut ensuite les masquer ou les
 *  supprimer dans l'éditeur, mais elles ne disparaissent jamais en silence. */
function buildObserved(
  evidence: Evidence[],
  descriptions: Map<Id, string>,
  resultStepId?: Id
): string {
  // Les preuves rattachées à l'étape « Results » sont rendues dans la section
  // Result (images inline) — on les exclut ici pour ne pas les compter deux fois.
  const observed = evidence.filter((e) => e.stepId !== resultStepId);
  const notes = observed.filter((e) => e.kind === "note");
  const photos = observed.filter((e) => e.kind === "photo");
  const dataFiles = observed.filter((e) => e.kind === "data");
  const parts: string[] = [];
  if (notes.length)
    parts.push(textBlockHtml(notes.map((nn) => `Note: ${nn.body} [${nn.id}]`).join("\n")));
  for (const p of photos) parts.push(photoHtml(p, descriptions.get(p.id)));
  if (dataFiles.length)
    parts.push(
      textBlockHtml(
        dataFiles.map((d) => `Data file: ${d.source?.label ?? d.body ?? "file"} [${d.id}]`).join("\n")
      )
    );
  if (parts.length === 0) parts.push("<p>No qualitative observation recorded.</p>");
  return parts.join("\n");
}

/** Bloc image d'une preuve photo — utilisé par Result ET Observed. La
 *  description vision (si présente) voyage dans data-description : pas de
 *  nouvel objet en base, le HTML du rapport est la seule source de vérité.
 *  Pas de data-hidden à la génération : les photos naissent visibles, seul
 *  l'éditeur (ReportImage) écrit cet attribut. */
function photoHtml(e: Evidence, description?: string): string {
  // Console de run → source.ref ; brique capturePhoto → fileId. /api/files sert par id de fichier.
  const fileId = e.fileId ?? e.source?.ref;
  const alt = escapeHtml(e.body ?? e.source?.label ?? "Photo");
  if (!fileId) return `<p>[Photo: ${alt}]</p>`;
  const desc = description?.trim()
    ? ` data-description="${escapeHtml(description.trim())}"`
    : "";
  return `<p><img src="/api/files/${escapeHtml(fileId)}" alt="${alt}"${desc}></p>`;
}

/** Section « Result » : les preuves consignées sur l'étape « Results » du run.
 *  Les photos sont rendues en VRAIES images inline (`/api/files/{id}`), les
 *  fichiers de données en liens, les mesures/notes en texte. Vide (placeholder)
 *  si le protocole n'a pas d'étape Results ou si rien n'y a été attaché. */
function buildResult(
  evidence: Evidence[],
  descriptions: Map<Id, string>,
  resultStepId?: Id
): string {
  const items = resultStepId ? evidence.filter((e) => e.stepId === resultStepId) : [];
  if (items.length === 0)
    return `<p><em>No result recorded yet — capture photos, measurements or data files on the Results step.</em></p>`;
  const parts: string[] = [];
  for (const e of items) {
    const fileId = e.fileId ?? e.source?.ref;
    if (e.kind === "photo") {
      parts.push(photoHtml(e, descriptions.get(e.id)));
    } else if (e.kind === "data") {
      const label = escapeHtml(e.source?.label ?? e.body ?? "data file");
      parts.push(
        fileId ? `<p><a href="/api/files/${escapeHtml(fileId)}">${label}</a></p>` : `<p>${label}</p>`
      );
    } else if (e.kind === "measurement" && e.measurement) {
      parts.push(`<p>${escapeHtml(e.body ?? `${e.measurement.value} ${e.measurement.unit}`)}</p>`);
    } else if (e.body) {
      parts.push(textBlockHtml(e.body));
    }
  }
  return parts.join("\n");
}

function buildDeviations(evidence: Evidence[]): string[] {
  return evidence
    .filter((e) => e.kind === "deviation" && e.deviation)
    .map((e) => {
      const d = e.deviation!;
      const reason = d.reason ? ` (${d.reason})` : "";
      return `[${severityLabel(d.severity)}] planned "${d.expected}", actual "${d.actual}"${reason} [${e.id}]`;
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
  result: string;
  deviations: string[];
}): Promise<z.infer<typeof NarrativeSchema>> {
  const { planned, performed, observed, result, deviations } = args;
  // Repli déterministe : jamais de chiffre inventé. Utilisé sans clé LLM,
  // mais aussi si l'appel LLM échoue (clé invalide, réseau, quota…) — un
  // rapport sans interprétation rédigée vaut mieux que pas de rapport.
  const fallback = (): z.infer<typeof NarrativeSchema> => {
    const crit = deviations.filter((d) => d.startsWith("[critical")).length;
    return {
      interpretation:
        deviations.length === 0
          ? "No deviation recorded. Results to be validated by the operator (automatic, non-expert interpretation)."
          : `${deviations.length} deviation(s) recorded${crit ? `, including ${crit} critical` : ""}. Review before drawing any conclusion. (Automatic interpretation, to be validated.)`,
      openQuestions:
        deviations.length > 0
          ? ["Do the critical deviations compromise quantification?"]
          : ["Are the controls (NTC, replicates) within spec?"],
      nextActions: ["Validate the report", "Check quality controls (NTC, melt curve, replicates)"],
    };
  };
  if (!hasLlmKey()) return fallback();
  try {
    return await generateObjectFor("report", {
      system: `You write the INTERPRETATION of a laboratory run, in English, in the tone of a senior researcher.
Absolute rules:
- Rely only on the FACTS provided below. Invent NO number, no measurement, no source.
- Clearly label this as an interpretation to be validated by a human.
- Be cautious and concise. Distinguish observation from hypothesis.`,
      prompt: `RUN FACTS:

## Planned
${planned}

## Performed
${performed}

## Result
${result}

## Observed
${observed}

## Deviations
${deviations.length ? deviations.join("\n") : "none"}

Produce: interpretation (prose), openQuestions, nextActions.`,
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
  if (citations.length === 0) return "<p>None.</p>";
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
    `<h1>Report: ${escapeHtml(meta.protocolTitle)}</h1>`,
    `<p><em>Generated ${escapeHtml(meta.generatedAt)} · run ${escapeHtml(meta.runId)}</em></p>`,
    `<blockquote><p>Planned / performed / observed / interpreted. Every observation is cited.</p></blockquote>`,
    sectionHtml("Objective", textBlockHtml(f.objective)),
    sectionHtml("Planned", textBlockHtml(f.planned)),
    sectionHtml("Performed", textBlockHtml(f.performed)),
    sectionHtml("Result", f.result),
    sectionHtml("Observed", f.observed),
    sectionHtml("Deviations", listHtml(f.deviations, "None.")),
    sectionHtml("Interpretation (to be validated)", textBlockHtml(f.interpretation)),
    sectionHtml("Open questions", listHtml(f.openQuestions, "None.")),
    sectionHtml("Next actions", listHtml(f.nextActions, "None.")),
    sectionHtml("Appendix: citations", citationsHtml(f.citations)),
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
    // Les images : trace textuelle légende + description vision, quel que soit
    // l'ordre des attributs (Tiptap peut les réordonner à la re-sérialisation).
    // Les photos masquées (data-hidden) restent incluses : jamais de perte
    // silencieuse dans l'export / l'indexation.
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? "";
      const desc = /\bdata-description="([^"]*)"/i.exec(tag)?.[1] ?? "";
      if (alt && desc) return `[Photo: ${alt} — ${desc}]`;
      if (desc) return `[Photo — ${desc}]`;
      return alt ? `[Photo: ${alt}]` : "[Photo]";
    })
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
function statusLabel(s: string): string {
  return { pending: "pending", active: "in progress", done: "done", skipped: "skipped" }[s] ?? s;
}
function severityLabel(s: string): string {
  return { minor: "minor", major: "major", critical: "critical" }[s] ?? s;
}
function claimForEvidence(e: Evidence): string {
  if (e.kind === "deviation" && e.deviation) return `deviation: ${e.deviation.actual}`;
  if (e.kind === "measurement" && e.measurement) return `${e.body ?? "measurement"} = ${e.measurement.value} ${e.measurement.unit}`;
  if (e.kind === "photo") return e.body ?? "photo";
  if (e.kind === "data") return `data file: ${e.source?.label ?? e.body ?? "file"}`;
  return e.body ?? "note";
}

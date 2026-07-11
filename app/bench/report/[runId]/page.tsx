// Page rapport d'un run — Brique Auto Report (getReport + exportReportMarkdown).
// Le rapport est normalement déjà généré au moment où on arrive ici
// (completeRunAction appelle generateReport avant de rediriger, best-effort) ;
// s'il manque (ex. échec LLM à la complétion), on le régénère ici avant
// d'abandonner en 404. On affiche ensuite le rapport section par section, avec
// le design system Bench. Le markdown exporté reste disponible en repli
// (copier-coller, archivage) sous un simple <details>/<pre> — pas de
// dépendance markdown nouvelle.
import { notFound } from "next/navigation";
import Link from "next/link";
import { getReport, generateReport, exportReportMarkdown } from "@/lib/bench";
import type { ReportCitation } from "@/lib/core";
import { getBenchSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ runId: string }>;

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function Section({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    <section className="card p-6 space-y-2 fade-up">
      <h2 className="eyebrow">{title}</h2>
      {note && <p className="text-xs text-muted">{note}</p>}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
    </section>
  );
}

function ListSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="card p-6 space-y-2 fade-up">
      <h2 className="eyebrow">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CitationsSection({ citations }: { citations: ReportCitation[] }) {
  return (
    <section className="card p-6 space-y-2 fade-up">
      <h2 className="eyebrow">Citations</h2>
      {citations.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <ul className="receipt space-y-1">
          {citations.map((ci, i) => (
            <li key={i}>
              « {ci.claim} » → {ci.evidenceIds.join(", ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ReportPage({ params }: { params: Params }) {
  const { runId } = await params;
  const { store } = getBenchSession();

  let report = await getReport(store, runId);
  if (!report) report = await generateReport(store, runId).catch(() => null);
  if (!report) notFound();

  const markdown = await exportReportMarkdown(store, runId);
  const c = report.content;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-6">
      <header className="fade-in">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Report</p>
            <h1 className="text-3xl font-semibold tracking-tight">{report.protocolTitle}</h1>
          </div>
          <Link href={`/bench/run/${runId}`} className="chip shrink-0 mt-1">
            ← Back to run
          </Link>
        </div>
        <p className="receipt mt-3">
          Generated {when(report.generatedAt)} · run {runId}
        </p>
        <p className="text-sm text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Planned / actually done / observed / interpreted. Every observation is sourced —
          see citations below.
        </p>
      </header>

      <Section title="Objective" body={c.objective} />
      <Section title="Planned" body={c.planned} />
      <Section title="Actually done" body={c.performed} />
      <Section title="Observed" body={c.observed} />
      <ListSection title="Deviations" items={c.deviations} empty="None recorded." />
      <Section
        title="Interpretation"
        body={c.interpretation}
        note="Automatic interpretation — to validate by an operator."
      />
      <ListSection title="Open questions" items={c.openQuestions} empty="None." />
      <ListSection title="Next actions" items={c.nextActions} empty="None." />
      <CitationsSection citations={c.citations} />

      <details className="card p-6 fade-up">
        <summary className="eyebrow cursor-pointer">Markdown export</summary>
        <pre className="mt-4 text-xs whitespace-pre-wrap font-mono text-muted overflow-x-auto">
          {markdown}
        </pre>
      </details>
    </div>
  );
}

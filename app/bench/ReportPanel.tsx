"use client";

// Panneau rapport de run — Brique Auto Report. Fetch au montage sur
// /api/bench/report/[id] (le rapport est normalement déjà généré à la
// complétion du run ; l'endpoint le régénère si absent). Le rapport est un
// document HTML (rendu initial des faits) affiché en lecture seule via
// NoteEditor ; l'édition arrive dans une tâche suivante. Le texte exporté
// reste disponible en repli sous un simple <details>/<pre>.
import { useEffect, useState } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import { NoteEditor } from "@/app/components/NoteEditor";
import type { StoredReport } from "@/lib/bench/auto-report";

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default function ReportPanel({ runId }: { runId: string }) {
  const { open } = useWindowsContext();
  const [data, setData] = useState<{ report: StoredReport; markdown: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bench/report/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<{ report: StoredReport; markdown: string }>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load report.");
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">Loading…</div>;

  const { report, markdown } = data;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-6">
      <header className="fade-in">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Report</p>
            <h1 className="text-3xl font-semibold tracking-tight">{report.protocolTitle}</h1>
          </div>
          <button type="button" onClick={() => open("run", { runId })} className="chip shrink-0 mt-1">
            ← Back to run
          </button>
        </div>
        <p className="receipt mt-3">
          Generated {when(report.generatedAt)} · run {runId}
        </p>
        <p className="text-sm text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Planned / actually done / observed / interpreted. Every observation is sourced —
          see citations in the document below.
        </p>
      </header>

      <section className="card p-6 doc-editor fade-up">
        <NoteEditor initialContent={report.html} editable={false} />
      </section>

      <details className="card p-6 fade-up">
        <summary className="eyebrow cursor-pointer">Text export</summary>
        <pre className="mt-4 text-xs whitespace-pre-wrap font-mono text-muted overflow-x-auto">
          {markdown}
        </pre>
      </details>
    </div>
  );
}

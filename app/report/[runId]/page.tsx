import Link from "next/link";
import { getDb } from "@/lib/core";
import { getReport, generateReport } from "@/features/auto-report";
import { PageShell, PageTitle, Card, Eyebrow, btn, severityColor } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const db = getDb();
  let report = await getReport(db, runId).catch(() => null);
  if (!report) {
    try {
      report = await generateReport(db, runId);
    } catch {
      return <PageShell><p>Rapport indisponible pour ce run.</p></PageShell>;
    }
  }
  const c = report.content;

  const facts: Array<[string, string]> = [
    ["Prévu", c.planned],
    ["Réellement fait", c.performed],
    ["Observé", c.observed],
  ];

  return (
    <PageShell>
      <PageTitle
        eyebrow={`Auto Report · run ${runId.slice(0, 10)}`}
        title={`Rapport — ${report.protocolTitle}`}
        lead={c.objective}
      />
      <p className="mb-6 text-sm text-sy-ink-muted">
        Prévu / réellement fait / observé / interprété — chaque observation est sourcée.
      </p>

      <div className="space-y-4">
        {facts.map(([label, body]) => (
          <Card key={label}>
            <Eyebrow>{label}</Eyebrow>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-sy-ink">{body}</pre>
          </Card>
        ))}

        <Card className="border-sy-amber/30">
          <Eyebrow>Déviations</Eyebrow>
          {c.deviations.length === 0 ? (
            <p className="mt-2 text-sm text-sy-ink-muted">Aucune.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {c.deviations.map((d, i) => {
                const sev = d.startsWith("[critique") ? "critical" : d.startsWith("[majeure") ? "major" : "minor";
                return <li key={i} className={severityColor(sev)}>{d}</li>;
              })}
            </ul>
          )}
        </Card>

        <Card>
          <Eyebrow>Interprétation (à valider)</Eyebrow>
          <p className="mt-2 text-sm text-sy-ink">{c.interpretation}</p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <Eyebrow>Questions ouvertes</Eyebrow>
            <ul className="mt-2 space-y-1 text-sm text-sy-ink-muted">
              {c.openQuestions.map((q, i) => <li key={i}>· {q}</li>)}
            </ul>
          </Card>
          <Card>
            <Eyebrow>Prochaines actions</Eyebrow>
            <ul className="mt-2 space-y-1 text-sm text-sy-ink-muted">
              {c.nextActions.map((a, i) => <li key={i}>· {a}</li>)}
            </ul>
          </Card>
        </div>

        <Card>
          <Eyebrow>Annexe — citations</Eyebrow>
          <ul className="mt-2 space-y-1 font-mono text-xs text-sy-ink-muted">
            {c.citations.map((ci, i) => (
              <li key={i}>« {ci.claim} » → {ci.evidenceIds.join(", ")}</li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/memory" className={btn.primary}>Interroger la mémoire →</Link>
        <Link href="/protocol" className={btn.ghost}>Nouveau run</Link>
      </div>
    </PageShell>
  );
}

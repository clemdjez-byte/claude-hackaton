import { getDb } from "@/lib/core";
import { getRunContext } from "@/features/live-bench";
import { listEvidence } from "@/features/evidence-capture";
import { PageShell, PageTitle } from "../../ui";
import { BenchConsole, type BenchData } from "./BenchConsole";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const ctx = await getRunContext(db, id);
  if (!ctx) return <PageShell><p>Run introuvable.</p></PageShell>;
  const evidence = await listEvidence(db, id);

  const data: BenchData = {
    runId: id,
    status: ctx.run.status,
    nReactions: ctx.run.scalingContext.n_reactions ?? null,
    currentStepId: ctx.currentStep?.id ?? null,
    steps: ctx.steps.map((s) => {
      const meta = ctx.protocol.steps.find((p) => p.index === s.protocolStepIndex);
      return {
        id: s.id,
        index: s.protocolStepIndex,
        title: s.title,
        status: s.status,
        instruction: meta?.instruction ?? "",
        critical: meta?.critical ?? false,
        durationSec: meta?.durationSec ?? null,
        resolvedParams: s.resolvedParams ?? null,
      };
    }),
    evidence: evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body ?? null,
      measurement: e.measurement ?? null,
      deviation: e.deviation ?? null,
    })),
  };

  return (
    <PageShell>
      <PageTitle
        eyebrow={`Live Bench · run ${id.slice(0, 10)} · ${ctx.run.status}`}
        title={ctx.protocol.title}
        lead={ctx.run.scalingContext.n_reactions ? `${ctx.run.scalingContext.n_reactions} réactions` : undefined}
      />
      <BenchConsole data={data} />
    </PageShell>
  );
}

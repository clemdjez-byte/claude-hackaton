// New revision — rouvre l'édition après signature : newPageVersion recopie
// html sans signedAt/signedBy dans une nouvelle version, qui redevient
// latest et donc éditable (autosave via updateDraft dessus). `[id]` = runId.
import { getReport } from "@/lib/bench";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  const { id: runId } = await params;
  const { store } = getBenchSession();

  const report = await getReport(store, runId);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  if (!report.signedAt) return Response.json({ error: "Report is not signed." }, { status: 409 });

  await store.newPageVersion(report.id, {
    content: {
      runId: report.runId,
      protocolTitle: report.protocolTitle,
      generatedAt: report.generatedAt,
      html: report.html,
    },
  });

  const draft = await getReport(store, runId);
  return Response.json({ report: draft });
}

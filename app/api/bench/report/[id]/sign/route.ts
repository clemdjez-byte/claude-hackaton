// Signature ELN — fige la version courante du rapport : newPageVersion pose
// signedAt/signedBy dans le content d'une NOUVELLE version immuable (la
// précédente reste consultable via getPage(id, version)). `[id]` = le runId.
import { getReport } from "@/lib/bench";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  const { id: runId } = await params;
  const { store, ctx } = getBenchSession();

  const report = await getReport(store, runId);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  if (report.signedAt) return Response.json({ error: "Report is already signed." }, { status: 409 });
  if (!report.html.trim()) return Response.json({ error: "Nothing to sign." }, { status: 400 });

  await store.newPageVersion(report.id, {
    content: {
      runId: report.runId,
      protocolTitle: report.protocolTitle,
      generatedAt: report.generatedAt,
      html: report.html,
      signedAt: new Date().toISOString(),
      signedBy: ctx.userId,
    },
  });

  const signed = await getReport(store, runId);
  return Response.json({ report: signed });
}

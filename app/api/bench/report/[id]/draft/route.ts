// Autosave du rapport — met à jour le html EN PLACE (updateDraft, même
// version) tant que le rapport n'est pas signé. `[id]` ici = le runId, comme
// GET /api/bench/report/[id] : on résout la page report via getReport.
import { getReport } from "@/lib/bench";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const { id: runId } = await params;
  const { store } = getBenchSession();

  const body = (await req.json().catch(() => ({}))) as { html?: string };
  if (typeof body.html !== "string") {
    return new Response("Invalid html", { status: 400 });
  }
  if (body.html.length > 2_000_000) {
    return new Response("html too large", { status: 413 });
  }

  const report = await getReport(store, runId);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  if (report.signedAt) {
    return Response.json({ error: "Report is signed; open a new revision to edit." }, { status: 409 });
  }

  await store.updateDraft(report.id, {
    content: {
      runId: report.runId,
      protocolTitle: report.protocolTitle,
      generatedAt: report.generatedAt,
      html: body.html,
    },
  });
  return Response.json({ ok: true });
}

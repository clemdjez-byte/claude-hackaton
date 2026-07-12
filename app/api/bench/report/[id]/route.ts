// Lecture thin pour ReportEditor — même logique que l'ancien
// app/bench/report/[runId]/page.tsx : le rapport est normalement déjà généré
// à la complétion du run (best-effort) ; s'il manque, on le régénère ici
// avant d'abandonner en 404.
import { getReport, generateReport, exportReportMarkdown } from "@/lib/bench";
import { getOutcome } from "@/lib/retrieval/knowledge-graph/outcome";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  let report = await getReport(store, id);
  if (!report) report = await generateReport(store, id).catch(() => null);
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });

  const markdown = await exportReportMarkdown(store, id);
  // Verdict scientifique saisi (source empirique du KG) — best-effort : absent
  // si non saisi ou si la feature KG est désactivée.
  const outcome = await getOutcome(store, id).catch(() => null);
  return Response.json({ report, markdown, outcome });
}

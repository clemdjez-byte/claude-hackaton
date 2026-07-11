// Lecture thin pour FilesPanel — explorateur de pages : rapports et
// protocoles de la ws, groupés. Un rapport (type='report') porte son runId
// dans son propre content (cf. lib/bench/auto-report ReportPageContent) —
// pas de requête supplémentaire, juste le lire depuis la page déjà chargée.
import { getBenchSession, WS } from "@/lib/session";
import type { PageMeta } from "@/app/files/types";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();
  const pages = await store.listPages(WS, {});

  const reports: PageMeta[] = pages
    .filter((p) => p.type === "report")
    .map((p) => ({
      id: p.id,
      title: p.title,
      createdAt: p.createdAt,
      type: p.type,
      runId: (p.content as { runId?: string } | null)?.runId,
    }));
  const protocols: PageMeta[] = pages
    .filter((p) => p.type === "protocol")
    .map((p) => ({ id: p.id, title: p.title, createdAt: p.createdAt, type: p.type }));

  return Response.json({ reports, protocols });
}

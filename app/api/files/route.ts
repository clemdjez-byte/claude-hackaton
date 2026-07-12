// Lecture thin pour FilesPanel — explorateur de pages : rapports uniquement
// (les protocoles ont leur propre panneau). Un rapport (type='report') porte
// son runId dans son propre content (cf. lib/bench/auto-report
// ReportPageContent) — pas de requête supplémentaire, juste le lire depuis
// la page déjà chargée. `folderId` vient directement de la page (null = racine).
import { getBenchSession, WS } from "@/lib/session";
import type { FolderMeta, PageMeta } from "@/app/files/types";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();

  const folders: FolderMeta[] = (await store.listFolders(WS)).map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));

  const pages = await store.listPages(WS, { type: "report" });
  const reports: PageMeta[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    type: p.type,
    runId: (p.content as { runId?: string } | null)?.runId,
    folderId: p.folderId ?? null,
  }));

  return Response.json({ folders, reports });
}

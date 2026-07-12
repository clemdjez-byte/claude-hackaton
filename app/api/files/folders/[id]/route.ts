// Renommer / déplacer / supprimer un dossier. La garde anti-cycle
// (canMoveFolder) tourne ICI, côté serveur — jamais fait confiance au
// client — avant tout déplacement. La suppression est en cascade : dossier +
// tous ses sous-dossiers + les rapports qu'ils contiennent.
import { getBenchSession, WS } from "@/lib/session";
import { canMoveFolder, descendantIds } from "@/app/files/tree";
import type { FolderMeta } from "@/app/files/types";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const folders = await store.listFolders(WS);
  if (!folders.some((f) => f.id === id)) {
    return Response.json({ error: "Folder not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; parentId?: string | null };
  const patch: { name?: string; parentId?: string | null } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
    patch.name = name;
  }

  if (body.parentId !== undefined) {
    if (body.parentId !== null && !folders.some((f) => f.id === body.parentId)) {
      return Response.json({ error: "Target folder not found." }, { status: 404 });
    }
    if (!canMoveFolder(folders, id, body.parentId)) {
      return Response.json({ error: "This move would create a cycle." }, { status: 409 });
    }
    patch.parentId = body.parentId;
  }

  const folder = await store.updateFolder(id, patch);
  const meta: FolderMeta = { id: folder.id, name: folder.name, parentId: folder.parentId };
  return Response.json({ folder: meta });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const folders = await store.listFolders(WS);
  if (!folders.some((f) => f.id === id)) {
    return Response.json({ error: "Folder not found." }, { status: 404 });
  }

  const toDelete = descendantIds(folders, id);
  toDelete.add(id);

  const reports = await store.listPages(WS, { type: "report" });
  const reportsToDelete = reports.filter((p) => p.folderId != null && toDelete.has(p.folderId));
  for (const report of reportsToDelete) {
    await store.deletePage(report.id);
  }
  for (const folderId of toDelete) {
    await store.deleteFolder(folderId);
  }

  return Response.json({ deletedFolders: toDelete.size, deletedReports: reportsToDelete.length });
}

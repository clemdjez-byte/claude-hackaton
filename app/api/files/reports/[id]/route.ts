// Déplacer / supprimer un rapport dans l'explorateur. Un rapport n'a pas de
// sous-arbre (contrairement à un dossier) : pas de garde anti-cycle à faire
// ici, juste vérifier que la cible existe.
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const page = await store.getPage(id);
  if (!page || page.type !== "report") {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { folderId?: string | null };
  if (body.folderId === undefined) {
    return Response.json({ error: "folderId is required." }, { status: 400 });
  }

  if (body.folderId !== null) {
    const folders = await store.listFolders(WS);
    if (!folders.some((f) => f.id === body.folderId)) {
      return Response.json({ error: "Target folder not found." }, { status: 404 });
    }
  }

  await store.setPageFolder(id, body.folderId);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const page = await store.getPage(id);
  if (!page || page.type !== "report") {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }

  await store.deletePage(id);
  return Response.json({ ok: true });
}

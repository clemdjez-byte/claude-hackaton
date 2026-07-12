// Création de dossier — thin, la validation (nom non vide) est la seule
// règle métier ici ; l'anti-cycle n'a pas lieu d'être à la création (un
// nouveau dossier n'a pas encore de descendants).
import { getBenchSession, WS } from "@/lib/session";
import type { FolderMeta } from "@/app/files/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; parentId?: string | null };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });

  const { store } = getBenchSession();

  if (body.parentId != null) {
    const folders = await store.listFolders(WS);
    if (!folders.some((f) => f.id === body.parentId)) {
      return Response.json({ error: "Target folder not found." }, { status: 404 });
    }
  }

  const folder = await store.insertFolder({ ws: WS, name, parentId: body.parentId ?? null });
  const meta: FolderMeta = { id: folder.id, name: folder.name, parentId: folder.parentId };
  return Response.json({ folder: meta });
}

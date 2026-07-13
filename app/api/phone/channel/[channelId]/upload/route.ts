// Réception d'une photo envoyée par le téléphone : validation stricte puis
// staging dans la table `fichier` du store SQLite. Le desktop la récupérera via
// /api/files/[fileId] et la rejouera dans le circuit d'import choisi (protocole,
// photo de run, data). Calquée sur evidence-photo.
import { createHash } from "node:crypto";
import { getBenchSession, WS } from "@/lib/session";
import { getChannel, MAX_PHOTOS_PER_CHANNEL } from "@/lib/phone-channel";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

// Nom de stockage sûr : on garde l'extension d'origine, on assainit le reste.
function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned || "photo";
}

type Params = Promise<{ channelId: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  const { channelId } = await params;
  const channel = getChannel(channelId);
  if (!channel) {
    return Response.json(
      { error: "This code has expired. Scan a new one from Octopus." },
      { status: 404 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const token = form.get("token");
  const file = form.get("file");
  if (token !== channel.token) {
    return Response.json({ error: "Invalid token." }, { status: 401 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "A photo is required." }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: "Photos only (JPG, PNG, WebP)." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Photo too large (max 20 MB)." }, { status: 413 });
  }
  if (channel.files.length >= MAX_PHOTOS_PER_CHANNEL) {
    return Response.json(
      { error: `Limit reached (${MAX_PHOTOS_PER_CHANNEL} photos per code).` },
      { status: 409 }
    );
  }

  try {
    const { store } = getBenchSession();
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const fichier = await store.insertFichier({
      ws: WS,
      storageKey: safeName(file.name),
      mime: file.type,
      sha256,
      bytes: buffer,
    });
    channel.files.push({ fileId: fichier.id, name: file.name, mime: file.type });
    return Response.json({ ok: true, count: channel.files.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 }
    );
  }
}

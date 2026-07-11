// Attache une PHOTO à un run en cours : le binaire va dans la table `fichier`
// du store SQLite (pas de bucket externe en standalone), la preuve `photo`
// référence l'id du fichier via `source.ref`. Alimentée par la console de run
// (webcam de l'ordinateur).
import { createHash } from "node:crypto";
import { capturePhotoRef } from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";
import { indexEvidence } from "@/lib/rag";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

// Nom de stockage sûr : on garde l'extension d'origine, on assainit le reste.
function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned || "photo";
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const runId = form.get("runId");
  const stepId = form.get("stepId");
  const caption = form.get("caption");
  const file = form.get("file");

  if (typeof runId !== "string" || !runId) {
    return Response.json({ error: "runId is required." }, { status: 400 });
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

  const { store, ctx } = getBenchSession();

  // Le run doit exister dans ce workspace (404 propre sinon).
  const run = await store.getRun(runId);
  if (!run || run.ws !== WS) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const fichier = await store.insertFichier({
      ws: WS,
      storageKey: safeName(file.name),
      mime: file.type,
      sha256,
      bytes: buffer,
    });
    const evidence = await capturePhotoRef(
      store,
      runId,
      typeof stepId === "string" && stepId ? stepId : undefined,
      { storageKey: fichier.id, label: file.name },
      ctx.userId,
      typeof caption === "string" ? caption : undefined
    );
    await indexEvidence(store, evidence);
    return Response.json({ evidenceId: evidence.id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Photo capture failed." },
      { status: 500 }
    );
  }
}

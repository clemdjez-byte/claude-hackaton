// Attache un FICHIER DE DONNÉES à un run en cours (CSV, Excel, PDF, txt, JSON…) :
// le binaire va dans la table `fichier` du store SQLite, la preuve `data`
// référence l'id du fichier via `source.ref`. Vocation : récupérer la donnée
// brute d'un outil/instrument. Alimenté par l'onglet Data de la console.
import { createHash } from "node:crypto";
import { captureDataFile } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

// Formats de données acceptés. On valide surtout par EXTENSION (les navigateurs
// renvoient souvent un type MIME vide/incohérent pour .csv), le MIME sert de
// secours. `mime` = type stocké (content-type du fichier téléchargé plus tard).
const DATA_TYPES: Record<string, string> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  tab: "text/tab-separated-values",
  txt: "text/plain",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pdf: "application/pdf",
  dat: "text/plain",
};

function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name.toLowerCase());
  return m ? m[1] : "";
}

// Nom de stockage sûr : on garde l'extension d'origine, on assainit le reste.
function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned || "data";
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
    return Response.json({ error: "A data file is required." }, { status: 400 });
  }
  const ext = extOf(file.name);
  const mime = DATA_TYPES[ext];
  if (!mime) {
    return Response.json(
      { error: "Data files only (CSV, TSV, TXT, JSON, XLSX, XLS, PDF)." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 20 MB)." }, { status: 413 });
  }

  const { store, ctx } = getBenchSession();

  const run = await store.getRun(runId);
  if (!run || run.ws !== WS) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    // On stocke avec le MIME déduit de l'extension (fiable), pas file.type (souvent vide).
    const fichier = await store.insertFichier({
      ws: WS,
      storageKey: safeName(file.name),
      mime: mime,
      sha256,
      bytes: buffer,
    });
    const evidence = await captureDataFile(
      store,
      runId,
      typeof stepId === "string" && stepId ? stepId : undefined,
      { storageKey: fichier.id, label: file.name },
      ctx.userId,
      typeof caption === "string" ? caption : undefined
    );
    return Response.json({ evidenceId: evidence.id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Data import failed." },
      { status: 500 }
    );
  }
}

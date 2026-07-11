// Lecture thin pour RunPanel — même logique que l'ancien
// app/bench/run/[runId]/page.tsx : le contexte de run + les preuves + la map
// des URLs locales des preuves fichier (photo / data), qui référencent un
// `fichier` de la brique via `source.ref` (cf. evidence-photo / evidence-data).
import { getRunContext, listEvidence } from "@/lib/bench";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const runContext = await getRunContext(store, id);
  if (!runContext) return Response.json({ error: "Run not found." }, { status: 404 });

  const evidence = await listEvidence(store, id);
  const attachmentUrls: Record<string, string> = {};
  for (const e of evidence) {
    if ((e.kind === "photo" || e.kind === "data") && e.source?.ref) {
      attachmentUrls[e.id] = `/api/files/${e.source.ref}`;
    }
  }

  return Response.json({ runContext, evidence, attachmentUrls });
}

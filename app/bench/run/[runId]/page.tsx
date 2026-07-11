import { notFound } from "next/navigation";
import { getRunContext, listEvidence } from "@/lib/bench";
import { getBenchSession } from "@/lib/session";
import RunConsole from "./RunConsole";

export const dynamic = "force-dynamic";

type Params = Promise<{ runId: string }>;

export default async function RunPage({ params }: { params: Params }) {
  const { runId } = await params;
  const { store } = getBenchSession();

  const runContext = await getRunContext(store, runId);
  if (!runContext) notFound();

  const evidence = await listEvidence(store, runId);

  // Les preuves fichier (photos + fichiers de données) référencent un `fichier`
  // de la brique via `source.ref` (voir evidence-photo/evidence-data routes) :
  // l'URL locale est juste /api/files/[fileId], pas de signature à faire.
  const attachmentUrls: Record<string, string> = {};
  for (const e of evidence) {
    if ((e.kind === "photo" || e.kind === "data") && e.source?.ref) {
      attachmentUrls[e.id] = `/api/files/${e.source.ref}`;
    }
  }

  return <RunConsole runContext={runContext} evidence={evidence} attachmentUrls={attachmentUrls} />;
}

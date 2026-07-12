// Lecture thin pour ProtocolPanel — même logique que l'ancien
// app/bench/protocols/[protocolId]/page.tsx, backfill lazy compris : un
// protocole jamais ouvert dans l'éditeur n'a pas de draft_doc → on le
// fabrique à la volée depuis les étapes structurées.
import { getProtocol } from "@/lib/bench";
import { stepsToDoc } from "@/lib/bench/protocol-studio/doc";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { store } = getBenchSession();

  const protocol = await getProtocol(store, id);
  if (!protocol) return Response.json({ error: "Protocol not found." }, { status: 404 });

  const page = await store.getPage(id);
  const initialDoc = page?.draftDoc ?? stepsToDoc(protocol.steps);

  return Response.json({ protocol, initialDoc });
}

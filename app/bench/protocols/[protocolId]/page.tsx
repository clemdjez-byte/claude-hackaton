import { notFound } from "next/navigation";
import { getProtocol } from "@/lib/bench";
import { stepsToDoc } from "@/lib/bench/protocol-studio/doc";
import { getBenchSession } from "@/lib/session";
import ProtocolDocEditor from "./ProtocolDocEditor";

export const dynamic = "force-dynamic";

type Params = Promise<{ protocolId: string }>;

export default async function ProtocolDetailPage({ params }: { params: Params }) {
  const { protocolId } = await params;
  const { store } = getBenchSession();

  const protocol = await getProtocol(store, protocolId);
  if (!protocol) notFound();

  // Backfill lazy : un protocole jamais ouvert dans l'éditeur n'a pas de draft_doc
  // → on le fabrique à la volée depuis les étapes structurées.
  const page = await store.getPage(protocolId);
  const initialDoc = page?.draftDoc ?? stepsToDoc(protocol.steps);

  return <ProtocolDocEditor protocol={protocol} initialDoc={initialDoc} />;
}

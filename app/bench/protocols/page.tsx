import { listProtocols, seedReferenceProtocol } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";
import ProtocolsClient from "./ProtocolsClient";

export const dynamic = "force-dynamic";

export default async function ProtocolsPage() {
  const { store } = getBenchSession();

  // Amorçage : sans protocole, on sème le protocole de référence RT-qPCR pour
  // que la bibliothèque ne soit jamais vide.
  let protocols = await listProtocols(store, WS);
  if (protocols.length === 0) {
    await seedReferenceProtocol(store, WS);
    protocols = await listProtocols(store, WS);
  }

  return <ProtocolsClient protocols={protocols} />;
}

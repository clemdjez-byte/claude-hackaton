// Lecture thin pour ProtocolsPanel — même logique que l'ancien
// app/bench/protocols/page.tsx : amorçage du protocole de référence RT-qPCR
// si la bibliothèque est vide, pour qu'elle ne le soit jamais.
import { listProtocols, seedReferenceProtocol } from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();

  let protocols = await listProtocols(store, WS);
  if (protocols.length === 0) {
    await seedReferenceProtocol(store, WS);
    protocols = await listProtocols(store, WS);
  }

  return Response.json({ protocols });
}

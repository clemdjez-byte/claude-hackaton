// Lecture thin pour ProtocolsPanel. Pas d'amorçage automatique : une
// bibliothèque vide reste vide (état vide propre côté UI). Le jeu de démo
// (marquage mitochondrial + expansion) est monté par `npm run seed`.
import { listProtocols } from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();
  const protocols = await listProtocols(store, WS);
  return Response.json({ protocols });
}

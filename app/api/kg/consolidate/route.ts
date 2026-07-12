// Route hôte : consolidation (dédoublonnage) du knowledge graph. Scanne le
// registre kg_node, fusionne les synonymes qui ont glissé (Tier 1 déterministe
// + juge IA sur les candidats ambigus) et renvoie un rapport de fusions. Sûr à
// relancer (idempotent). Gate sur le flag via consolidateGraph (assertEnabled).
import { consolidateGraph } from "@/lib/retrieval/knowledge-graph/consolidate";
import { getBenchSession, WS } from "@/lib/session";
import { FeatureDisabledError } from "@/lib/core";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const { store } = getBenchSession();
  try {
    const report = await consolidateGraph(store, WS);
    return Response.json(report);
  } catch (e) {
    if (e instanceof FeatureDisabledError) {
      return Response.json({ error: "Knowledge graph feature disabled." }, { status: 409 });
    }
    console.error("[kg] consolidation échouée :", e);
    return Response.json({ error: e instanceof Error ? e.message : "Consolidation failed." }, { status: 500 });
  }
}

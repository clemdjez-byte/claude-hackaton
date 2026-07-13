// scripts/add-dmso-failure-mode.ts — ajoute le garde-fou « DMSO > 0,1 % » manquant.
//   npx tsx --env-file-if-exists=.env.local scripts/add-dmso-failure-mode.ts
//
// L'extraction IA du graphe n'a chiffré qu'un seul seuil (cell_density). Le DMSO
// n'existe qu'en prose sur P2 → check_parameter_risk ne pouvait pas le déclencher.
// Ce script insère le seuil structuré. Idempotent (ré-exécutable sans doublon).
// Prérequis : l'entrée `dmso_pct` (+ alias) est déclarée dans PARAMETER_TYPES
// (lib/retrieval/knowledge-graph/ontology.ts) pour que normalizeParamKey("DMSO")
// → "dmso_pct" et que le tool retrouve cette ligne.
import { getBenchSession, WS } from "@/lib/session";

const PROTOCOL_ID = "pg_ff4b30c1d5"; // P2 — FLT3 TKI dose-response viability (CellTiter-Glo)
const KEY = "dmso_pct"; // doit égaler normalizeParamKey("DMSO")

async function main() {
  const { store } = getBenchSession();
  const existing = await store.listFailureModes(WS, { protocolId: PROTOCOL_ID, paramTypeKey: KEY });
  if (existing.some((f) => f.operator === ">" && f.threshold === 0.1)) {
    console.log("dmso_pct > 0.1% : garde-fou déjà présent — no-op");
    return;
  }
  const fm = await store.insertFailureMode({
    ws: WS,
    protocolId: PROTOCOL_ID,
    paramTypeKey: KEY,
    operator: ">",
    threshold: 0.1,
    unit: "%",
    verdict: "failure",
    mechanism:
      "Final DMSO above 0.1% is independently cytotoxic and confounds the drug effect (vehicle toxicity left-shifts the IC50).",
  });
  console.log("garde-fou DMSO inséré :", fm.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

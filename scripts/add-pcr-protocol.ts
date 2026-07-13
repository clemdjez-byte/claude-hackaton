// scripts/add-pcr-protocol.ts — OPTIONNEL, non destructif.
// Ajoute au workspace le protocole RT-qPCR de référence, qui possède un MASTER
// MIX (recipe). Les protocoles AML n'en ont pas (culture / flow / western), donc
// l'outil scale_recipe du chat n'a rien à mettre à l'échelle sur ce dataset.
// Lancer ce script UNE fois rend l'effet « scale to N reactions » démontrable,
// sans toucher au seed AML (il ne fait qu'AJOUTER une page).
//
// Run: `npm run add-pcr`  (ou tsx --env-file-if-exists=.env.local scripts/add-pcr-protocol.ts)
// Les clés API sont facultatives : l'indexation RAG/KG est best-effort ; le
// protocole (et donc scale_recipe) fonctionne dès qu'il est en base.
import { seedReferenceProtocol, publishProtocol } from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";
import { indexProtocol } from "@/lib/rag";
import { indexProtocolGraph } from "@/lib/kg";

async function main() {
  const { store } = getBenchSession();
  const draft = await seedReferenceProtocol(store, WS);
  const published = await publishProtocol(store, draft.id);

  // Indexation best-effort : le protocole existe déjà en base même si les clés
  // API manquent — scale_recipe le lit directement.
  try {
    await indexProtocol(store, published);
    await indexProtocolGraph(store, published);
  } catch (e) {
    console.warn("indexation best-effort échouée (protocole ajouté quand même) :", e);
  }

  console.log(`✓ Protocole PCR ajouté : « ${published.title} » (${published.id}).`);
  console.log("  → Dans le chat : « Scale the RT-qPCR protocol to 24 reactions ».");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

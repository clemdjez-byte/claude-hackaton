// scripts/seed.ts — jeu de données de démo pour Octopus (Bench standalone),
// centré sur le KNOWLEDGE GRAPH : un protocole de marquage mitochondrial + une
// série de runs à signal, plus un 2e protocole (expansion cellulaire) qui porte
// le croisement inter-protocoles sur la densité cellulaire. Le graphe
// (ParameterTypes, réactifs, FailureModes, causes) est extrait par l'IA à partir
// du texte libre des protocoles et des preuves de runs.
//
// Repartir d'une base propre : `rm -f octopus.db* && npm run seed`.
// L'extraction IA du graphe nécessite ANTHROPIC_API_KEY (sinon fail-closed,
// graphe quasi vide) : `npm run seed` charge .env.local (cf. package.json).
//
// Lancé via `tsx` : Node sait « stripper » les types nativement mais ne résout
// pas l'alias tsconfig "@/*" utilisé par lib/session.ts / lib/rag.ts — tsx le
// fait sans configuration supplémentaire.
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";
import {
  createProtocol,
  publishProtocol,
  startRun,
  captureNote,
  captureMeasurement,
  completeRun,
  generateReport,
} from "@/lib/bench";
import type { Db, Verdict } from "@/lib/core";
import { getBenchSession, WS, OPERATOR } from "@/lib/session";
import { indexProtocol, indexRun } from "@/lib/rag";
import { saveOutcome } from "@/lib/retrieval/knowledge-graph/outcome";
import { indexProtocolGraph, indexRunGraph } from "@/lib/kg";

const BASE_URL = "http://localhost:3000";

// ── Knowledge Graph : protocole de marquage + série de runs à signal ──────────
export const STAINING_DRAFT: ProtocolDraft = {
  title: "Marquage mitochondrial (MitoTracker/Hoechst)",
  summary: "Passage cellulaire → marquage fluorescent → fixation PFA.",
  materials: [
    { name: "Trypsine", role: "reagent" },
    { name: "MitoTracker", role: "reagent" },
    { name: "Hoechst", role: "reagent" },
    { name: "PFA 4%", role: "reagent" },
    { name: "PBS 1X", role: "reagent" },
  ],
  parameters: [
    { key: "trypsination_time", label: "Temps de trypsination", unit: "min" },
    { key: "cell_density", label: "Densité cellulaire", unit: "cells/mL" },
    { key: "mitotracker_conc", label: "Concentration MitoTracker", unit: "nM" },
    { key: "hoechst_conc", label: "Concentration Hoechst", unit: "nM" },
    { key: "staining_incubation_time", label: "Temps d'incubation du marquage", unit: "min" },
    { key: "pfa_exposure_time", label: "Temps d'exposition au PFA", unit: "min" },
  ],
  steps: [
    { index: 0, title: "Trypsination", instruction: "37°C, 3 min. ⚠️ < 3 min : cellules restent adhérentes (échec). > 3 min : mortalité augmentée." },
    { index: 1, title: "Ensemencement", instruction: "Densité cible 50 000 à 200 000 cellules/mL. ⚠️ > 200 000 : confluence et mort cellulaire (échec)." },
    { index: 2, title: "Marquage", instruction: "MitoTracker 500 nM + Hoechst 1000 nM dans le milieu, 40 min. ⚠️ MitoTracker < 500 nM : signal peu visible. ⚠️ incubation < 20 min : marquage insuffisant (échec)." },
    { index: 3, title: "Fixation PFA", instruction: "PFA 4% à 4°C, max 10 min. ⚠️ > 10 min : cellules abîmées et marquage dégradé (échec)." },
  ],
  sources: [{ kind: "doi", ref: "10.1083/jcb.mito-staining", label: "Best practices mitochondrial imaging" }],
};

// Valeurs nominales (un run de contrôle) ; chaque run dévie d'UN facteur.
const NOMINAL: Record<string, number> = {
  trypsination_time: 3, cell_density: 120000, mitotracker_conc: 500,
  hoechst_conc: 1000, staining_incubation_time: 40, pfa_exposure_time: 10,
};

// Chaque run porte des PREUVES TEXTE LIBRE (`notes` + une mesure optionnelle) —
// c'est ce que l'IA lit (indexRunGraph → extractRunOntology) pour en tirer
// valeurs, réactifs et causes qualitatives. `params` sert uniquement à démarrer
// le run (startRun).
export const STAINING_RUNS: Array<{
  params: Record<string, number>;
  notes: string[];
  metric?: { name: string; value: number; unit: string };
  verdict: Verdict;
  reason?: string;
}> = [
  {
    params: { ...NOMINAL },
    notes: [
      "Trypsination réalisée 3 min, cellules bien décollées.",
      "Ensemencement à densité nominale (120 000 cellules/mL).",
      "Marquage MitoTracker 500 nM / Hoechst 1000 nM, 40 min : signal net en microscopie.",
      "Fixation PFA 4 %, 10 min, cellules intactes.",
    ],
    metric: { name: "Viabilité", value: 92, unit: "% viability" },
    verdict: "success",
  },
  {
    params: { ...NOMINAL, trypsination_time: 2 },
    notes: [
      "Trypsination réalisée en 2 min seulement.",
      "Cellules non décollées, marquage impossible.",
    ],
    verdict: "failure",
    reason: "cellules non décollées",
  },
  {
    params: { ...NOMINAL, pfa_exposure_time: 15 },
    notes: [
      "Fixation PFA laissée 15 min au lieu des 10 min prévus.",
      "Marquage dégradé, signal faible en microscopie.",
    ],
    metric: { name: "Score de signal", value: 3, unit: "/10 signal" },
    verdict: "failure",
    reason: "marquage dégradé",
  },
  {
    params: { ...NOMINAL, cell_density: 350000 },
    notes: [
      "Ensemencement à 350 000 cellules/mL, bien au-dessus de la cible (50 000–200 000).",
      "Confluence atteinte avant le marquage, mortalité cellulaire élevée observée.",
    ],
    metric: { name: "Viabilité", value: 40, unit: "% viability" },
    verdict: "failure",
    reason: "confluence",
  },
  {
    params: { ...NOMINAL, mitotracker_conc: 300 },
    notes: [
      "Concentration MitoTracker réduite à 300 nM (au lieu de 500 nM).",
      "Signal mitochondrial faible mais présent en microscopie.",
    ],
    metric: { name: "Score de signal", value: 4, unit: "/10 signal" },
    verdict: "partial",
    reason: "signal faible",
  },
  {
    params: { ...NOMINAL, staining_incubation_time: 15 },
    notes: [
      "Incubation du marquage écourtée à 15 min (au lieu de 40 min).",
      "Marquage très insuffisant, signal quasi absent en microscopie.",
    ],
    metric: { name: "Score de signal", value: 2, unit: "/10 signal" },
    verdict: "failure",
    reason: "signal trop faible",
  },
  {
    params: { ...NOMINAL },
    notes: [
      "Conditions nominales reproduites : trypsination 3 min, densité 120 000 cellules/mL.",
      "Marquage net, fixation conforme.",
    ],
    metric: { name: "Viabilité", value: 88, unit: "% viability" },
    verdict: "success",
  },
];

// 2e protocole léger : porte le croisement inter-protocoles sur cell_density.
const EXPANSION_DRAFT: ProtocolDraft = {
  title: "Expansion cellulaire",
  summary: "Amplification d'une lignée avant expérience.",
  materials: [{ name: "Milieu de culture", role: "reagent" }],
  parameters: [{ key: "cell_density", label: "Densité cellulaire", unit: "cells/mL" }],
  steps: [{ index: 0, title: "Ensemencement", instruction: "Densité cible 50 000 à 200 000 cellules/mL. ⚠️ > 200 000 : mort cellulaire." }],
  sources: [{ kind: "doi", ref: "10.1/expansion", label: "Culture expansion" }],
};

/** Monte le dataset KG complet dans un store donné (idempotent par store neuf).
 *  Le graphe (ParameterTypes, réactifs, lignées, FailureModes, causes) est
 *  entièrement extrait par l'IA à partir du texte (protocole + preuves/rapport
 *  des runs) — cf. indexProtocolGraph / indexRunGraph. Sans ANTHROPIC_API_KEY,
 *  l'extraction est fail-closed (graphe quasi vide). */
export async function seedKnowledgeGraph(store: Db): Promise<void> {
  const ws = WS;
  // 1. Protocole marquage : créer + publier + extraction IA de l'ontologie
  const p = await createProtocol(store, ws, STAINING_DRAFT);
  const staining = await publishProtocol(store, p.id);
  await indexProtocol(store, staining);
  await indexProtocolGraph(store, staining); // ParameterTypes / réactifs / lignées / FailureModes (IA)
  console.log(`✓ Protocole publié : « ${staining.title} » (v${staining.version}, ${staining.id})`);

  // 2. Runs : startRun → preuves TEXTE → completeRun → rapport → verdict → RAG + graphe (IA)
  let n = 0;
  for (const spec of STAINING_RUNS) {
    const { run, steps } = await startRun(store, ws, {
      protocolId: staining.id,
      protocolVersion: staining.version,
      operator: OPERATOR,
      params: spec.params,
    });
    for (const note of spec.notes) await captureNote(store, run.id, undefined, note, OPERATOR);
    if (spec.metric) await captureMeasurement(store, run.id, undefined, spec.metric, OPERATOR);
    const completed = await completeRun(store, run.id);
    await generateReport(store, run.id); // rapport (repli déterministe hors-ligne si pas de clé)
    const outcome = await saveOutcome(store, { ws, runId: run.id, verdict: spec.verdict, metric: spec.metric, reason: spec.reason });
    await indexRun(store, completed, staining.title, steps); // RAG (ancrage chat)
    await indexRunGraph(store, completed, steps, staining, outcome); // extraction IA du run
    n += 1;
  }
  console.log(`✓ ${n} runs de marquage (verdicts saisis, graphe extrait par IA)`);

  // 3. 2e protocole + 1 run à forte densité — porte le croisement inter-protocoles
  //    sur cell_density (déclaré en texte libre dans les deux protocoles ; charge
  //    à l'extraction IA de faire remonter le FailureMode partagé).
  const e = await createProtocol(store, ws, EXPANSION_DRAFT);
  const expansion = await publishProtocol(store, e.id);
  await indexProtocol(store, expansion);
  await indexProtocolGraph(store, expansion);

  const { run: eRun, steps: eSteps } = await startRun(store, ws, {
    protocolId: expansion.id,
    protocolVersion: expansion.version,
    operator: OPERATOR,
    params: { cell_density: 400000 },
  });
  await captureNote(
    store,
    eRun.id,
    undefined,
    "Ensemencement à densité 400 000 cellules/mL, bien au-dessus de la cible (50 000–200 000 cellules/mL) — confluence atteinte, cellules non exploitables pour l'expérience suivante.",
    OPERATOR
  );
  const eCompleted = await completeRun(store, eRun.id);
  await generateReport(store, eRun.id);
  const eOutcome = await saveOutcome(store, { ws, runId: eRun.id, verdict: "failure", reason: "confluence" });
  await indexRun(store, eCompleted, expansion.title, eSteps);
  await indexRunGraph(store, eCompleted, eSteps, expansion, eOutcome);
  console.log(`✓ Protocole publié : « ${expansion.title} » + 1 run (croisement cell_density)`);
}

async function main(): Promise<void> {
  const { store } = getBenchSession();
  console.log("Octopus — seed de démo (knowledge graph)\n");

  await seedKnowledgeGraph(store);

  console.log("\n— Résumé —");
  console.log("Protocoles publiés : 2 (marquage mitochondrial, expansion cellulaire)");
  console.log("Runs : 8 (7 marquage + 1 expansion) — verdicts saisis, graphe peuplé par IA");
  console.log(`\nOuvre ${BASE_URL}/ (npm run dev) — le bureau Octopus. Depuis la toolbar :`);
  console.log("  Bench → protocole « Marquage mitochondrial (MitoTracker/Hoechst) » + ses runs");
  console.log("  Cartouche du bas → « Ask your lab » pour interroger le knowledge graph");

  store.close();
}

main().catch((e: unknown) => {
  console.error("Échec du seed :", e);
  process.exitCode = 1;
});

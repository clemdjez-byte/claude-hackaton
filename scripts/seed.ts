// scripts/seed.ts — jeu de données de démo pour Octopus (Bench standalone).
// Aucun appel LLM : les 2 protocoles sont écrits en dur (le protocole de
// référence via seedReferenceProtocol, Bradford ci-dessous à la main) et le
// rapport passe par le repli hors-ligne déterministe de l'Auto Report si
// ANTHROPIC_API_KEY est absente (lib/bench/auto-report, cf. hasLlmKey()).
//
// Repartir d'une base propre : `rm -f octopus.db* && npm run seed`.
//
// Lancé via `tsx` (cf. package.json "seed") : Node 24 sait « stripper » les
// types nativement (--experimental-strip-types), mais ne résout pas l'alias
// tsconfig "@/*" utilisé par lib/session.ts et lib/rag.ts (testé : échoue en
// MODULE_NOT_FOUND) — tsx le fait sans configuration supplémentaire.
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";
import {
  seedReferenceProtocol,
  createProtocol,
  publishProtocol,
  startRun,
  advanceStep,
  captureNote,
  captureMeasurement,
  captureDeviation,
  listEvidence,
  completeRun,
  generateReport,
  exportReportMarkdown,
  getRunContext,
} from "@/lib/bench";
import type { Db, Step } from "@/lib/core";
import { getBenchSession, WS, OPERATOR } from "@/lib/session";
import {
  indexProtocol,
  indexRun,
  indexEvidence,
  indexReport,
  linkRunToProtocol,
  linkReportToRun,
} from "@/lib/rag";

const BASE_URL = "http://localhost:3000";

// ── Bradford protein assay — protocole réaliste écrit à la main (pas de LLM) ─
// Dosage colorimétrique des protéines totales par liaison au bleu de Coomassie
// G-250 (réactif Bio-Rad Protein Assay), lecture à 595 nm contre une gamme
// étalon BSA. Comme le RT-qPCR de référence : un mix partagé (réactif dilué,
// mis à l'échelle par du code déterministe) + un composant ajouté puits par
// puits (échantillon), sans excès de pipetage.
const BRADFORD_PROTOCOL: ProtocolDraft = {
  title: "Dosage protéique de Bradford (microplaque, BSA)",
  summary:
    "Quantification colorimétrique des protéines totales par liaison au bleu de Coomassie G-250 (réactif Bio-Rad Protein Assay), lecture à 595 nm contre une gamme étalon BSA. Format microplaque, réactif dilué 1:5 en mix partagé, échantillon ajouté puits par puits.",
  materials: [
    { name: "Échantillons protéiques (inconnus)", role: "reagent" },
    { name: "Standard BSA", role: "reagent", stockConc: { value: 2, unit: "mg/mL" } },
    { name: "Bio-Rad Protein Assay Dye Reagent Concentrate (5×)", role: "reagent" },
    { name: "Eau distillée (diluant)", role: "reagent" },
    { name: "Plaque 96 puits (dosage colorimétrique)", role: "consumable" },
    { name: "Lecteur de microplaques (595 nm)", role: "equipment" },
    { name: "Micropipettes multicanaux", role: "equipment" },
  ],
  parameters: [
    { key: "n_reactions", label: "Nombre de puits (échantillons + standards + blanc)", default: 16, unit: "puits" },
    { key: "overage_pct", label: "Excès de pipetage", default: 15, unit: "%" },
  ],
  recipe: {
    name: "Réactif de Bradford dilué (1×, Bio-Rad Protein Assay)",
    finalVolumePerReaction: { value: 255, unit: "µL" },
    components: [
      { name: "Bio-Rad Protein Assay Dye Reagent Concentrate (5×)", perReaction: { value: 50, unit: "µL" } },
      { name: "Eau distillée (diluant)", perReaction: { value: 200, unit: "µL" } },
      { name: "Échantillon / standard BSA / blanc", perReaction: { value: 5, unit: "µL" }, perWell: true },
    ],
  },
  steps: [
    {
      index: 0,
      title: "Préparer la gamme étalon BSA",
      instruction:
        "Diluer le standard BSA (2 mg/mL) en série dans le diluant pour obtenir 8 points de gamme (0 à 2 mg/mL), en duplicate. Garder sur glace.",
    },
    {
      index: 1,
      title: "Diluer les échantillons inconnus",
      instruction:
        "Diluer chaque échantillon pour rester dans la plage linéaire du dosage (~0,1–1,4 mg/mL). Prévoir un blanc (diluant seul).",
    },
    {
      index: 2,
      title: "Préparer le mix partagé de réactif Bradford (1×)",
      instruction:
        "Diluer le concentré Bio-Rad Protein Assay Dye Reagent (5×) 1:5 dans l'eau distillée, pour le nombre de puits + excès de pipetage. Volumes calculés par Octopus. Filtrer si précipité visible.",
      critical: true,
    },
    {
      index: 3,
      title: "Distribuer le réactif en plaque",
      instruction: "Distribuer 250 µL de réactif dilué par puits.",
      durationSec: 300,
    },
    {
      index: 4,
      title: "Ajouter échantillons et standards",
      instruction:
        "Ajouter 5 µL d'échantillon, de standard ou de blanc par puits, en duplicate. Mélanger par pipetage doux (jamais au vortex : la mousse fausse la lecture).",
      critical: true,
    },
    {
      index: 5,
      title: "Incuber à température ambiante",
      instruction:
        "Incuber 5 à 60 min à température ambiante, à l'abri de la lumière directe. La couleur est stable environ 1 heure.",
      durationSec: 300,
      critical: true,
    },
    {
      index: 6,
      title: "Lire l'absorbance à 595 nm",
      instruction: "Lire l'absorbance de chaque puits à 595 nm sur le lecteur de microplaques.",
      critical: true,
    },
    {
      index: 7,
      title: "Construire la gamme et calculer les concentrations",
      instruction:
        "Tracer l'absorbance des standards contre la concentration (régression linéaire, R² ≥ 0,99 attendu). Interpoler la concentration de chaque échantillon depuis la courbe ; diluer et relire si hors gamme.",
    },
  ],
  sources: [
    {
      kind: "doi",
      ref: "10.1016/0003-2697(76)90527-3",
      label:
        "Bradford, M.M. (1976). A rapid and sensitive method for the quantitation of microgram quantities of protein utilizing the principle of protein-dye binding. Anal Biochem 72:248–254.",
    },
    {
      kind: "url",
      ref: "https://www.bio-rad.com/en-us/product/bio-rad-protein-assay",
      label:
        "Bio-Rad Protein Assay — dye reagent concentrate, protocole microplaque (dilution 1:5, 5 µL échantillon + 250 µL réactif).",
    },
  ],
};

// ── Petits raccords : capturer une preuve ET l'indexer (mémoire du labo),
// comme le fait chaque server action du Bench (app/bench/actions.ts). ─────
function stepAt(steps: Step[], index: number): Step {
  const found = steps.find((s) => s.protocolStepIndex === index);
  if (!found) throw new Error(`Étape d'index ${index} introuvable.`);
  return found;
}

async function note(store: Db, runId: string, stepId: string, text: string): Promise<void> {
  const ev = await captureNote(store, runId, stepId, text, OPERATOR);
  await indexEvidence(store, ev);
}

async function measurement(
  store: Db,
  runId: string,
  stepId: string,
  m: { name?: string; value: number; unit: string; instrument?: string }
): Promise<void> {
  const ev = await captureMeasurement(store, runId, stepId, m, OPERATOR);
  await indexEvidence(store, ev);
}

async function deviation(
  store: Db,
  runId: string,
  stepId: string,
  d: { expected: string; actual: string; reason?: string; severity: "minor" | "major" | "critical" }
): Promise<void> {
  const ev = await captureDeviation(store, runId, stepId, d, OPERATOR);
  await indexEvidence(store, ev);
}

async function main(): Promise<void> {
  const { store } = getBenchSession();
  console.log("Octopus — seed de démo\n");

  // ── Protocoles ────────────────────────────────────────────────────────
  const refDraft = await seedReferenceProtocol(store, WS);
  const ref = await publishProtocol(store, refDraft.id); // renvoie la version FIGÉE (sealDraft)
  await indexProtocol(store, ref);
  console.log(`✓ Protocole publié : « ${ref.title} » (v${ref.version}, ${ref.id})`);

  const bradfordDraft = await createProtocol(store, WS, BRADFORD_PROTOCOL);
  const bradford = await publishProtocol(store, bradfordDraft.id);
  await indexProtocol(store, bradford);
  console.log(`✓ Protocole publié : « ${bradford.title} » (v${bradford.version}, ${bradford.id})`);

  // ── Run A : complété, 6 réactions, propre (pas de déviation) ────────────
  const runA = await startRun(store, WS, {
    operator: OPERATOR,
    protocolId: ref.id,
    protocolVersion: ref.version,
    params: { n_reactions: 6, overage_pct: 10 },
  });
  await linkRunToProtocol(store, runA.run.id, ref.id); // best-effort, cf. lib/rag.ts

  await measurement(store, runA.run.id, stepAt(runA.steps, 0).id, {
    name: "Concentration ARN total",
    value: 850,
    unit: "ng/µL",
    instrument: "Nanodrop 2000",
  });
  await note(store, runA.run.id, stepAt(runA.steps, 0).id, "A260/280 = 1,98, A260/230 = 2,1 — qualité conforme.");
  await advanceStep(store, runA.run.id); // 0 done → 1 active

  await note(store, runA.run.id, stepAt(runA.steps, 1).id, "Mix RT assemblé sur glace, volumes conformes.");
  await advanceStep(store, runA.run.id); // → 2

  await note(
    store,
    runA.run.id,
    stepAt(runA.steps, 2).id,
    "Programme RT lancé : 25 °C 10 min, 42 °C 30 min, 85 °C 5 min."
  );
  await advanceStep(store, runA.run.id); // → 3

  await note(store, runA.run.id, stepAt(runA.steps, 3).id, "cDNA dilué 1:10 dans TE, conservé sur glace.");
  await advanceStep(store, runA.run.id); // → 4

  await note(
    store,
    runA.run.id,
    stepAt(runA.steps, 4).id,
    "Master mix préparé selon les volumes calculés (118,8 µL pour 6 réactions, excès 10 %). SYBR protégé de la lumière."
  );
  await advanceStep(store, runA.run.id); // → 5
  await advanceStep(store, runA.run.id); // 5 done → 6

  await note(store, runA.run.id, stepAt(runA.steps, 6).id, "NTC inclus (eau à la place du cDNA).");
  await advanceStep(store, runA.run.id); // → 7

  await note(store, runA.run.id, stepAt(runA.steps, 7).id, "Plaque scellée, centrifugation brève (bulles éliminées).");
  await advanceStep(store, runA.run.id); // → 8

  await measurement(store, runA.run.id, stepAt(runA.steps, 8).id, {
    name: "Ct échantillon 1",
    value: 23.8,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await measurement(store, runA.run.id, stepAt(runA.steps, 8).id, {
    name: "Ct échantillon 2",
    value: 24.1,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await measurement(store, runA.run.id, stepAt(runA.steps, 8).id, {
    name: "Ct NTC",
    value: 39.6,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await advanceStep(store, runA.run.id); // → 9

  await note(
    store,
    runA.run.id,
    stepAt(runA.steps, 9).id,
    "Melt curve : pic unique net à 82 °C — amplicon spécifique, pas de primer-dimer."
  );
  await advanceStep(store, runA.run.id); // → 10

  await measurement(store, runA.run.id, stepAt(runA.steps, 10).id, {
    name: "Écart réplicats techniques",
    value: 0.3,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await note(store, runA.run.id, stepAt(runA.steps, 10).id, "Réplicats dans la tolérance MIQE (< 0,5 Ct).");
  await advanceStep(store, runA.run.id); // 10 done, aucune étape suivante

  const ctxA = await getRunContext(store, runA.run.id);
  const runACompleted = await completeRun(store, runA.run.id);
  const reportA = await generateReport(store, runA.run.id); // repli hors-ligne si pas de clé LLM
  await linkReportToRun(store, reportA.id, runA.run.id); // best-effort, cf. lib/rag.ts
  if (ctxA) await indexRun(store, runACompleted, ctxA.protocol.title, ctxA.steps);
  const markdownA = await exportReportMarkdown(store, runA.run.id);
  await indexReport(store, reportA, markdownA);
  console.log(`✓ Run complété (propre) : ${runA.run.id} — 6 réactions`);
  console.log(`✓ Rapport généré : ${reportA.id}`);

  // ── Run B : complété, 24 réactions — déviation critique + mesure aberrante
  // (c'est ce run qui reçoit le rapport généré, cf. brief). ────────────────
  const runB = await startRun(store, WS, {
    operator: OPERATOR,
    protocolId: ref.id,
    protocolVersion: ref.version,
    params: { n_reactions: 24, overage_pct: 10 },
  });
  await linkRunToProtocol(store, runB.run.id, ref.id); // best-effort, cf. lib/rag.ts

  await measurement(store, runB.run.id, stepAt(runB.steps, 0).id, {
    name: "Concentration ARN total",
    value: 612,
    unit: "ng/µL",
    instrument: "Nanodrop 2000",
  });
  await note(store, runB.run.id, stepAt(runB.steps, 0).id, "A260/280 = 1,91 — qualité correcte.");
  await advanceStep(store, runB.run.id); // → 1

  await note(store, runB.run.id, stepAt(runB.steps, 1).id, "Mix RT assemblé sur glace pour 24 réactions.");
  await advanceStep(store, runB.run.id); // → 2

  await note(
    store,
    runB.run.id,
    stepAt(runB.steps, 2).id,
    "Programme RT lancé : 25 °C 10 min, 42 °C 30 min, 85 °C 5 min."
  );
  await advanceStep(store, runB.run.id); // → 3

  await note(store, runB.run.id, stepAt(runB.steps, 3).id, "cDNA dilué 1:10 dans TE.");
  await advanceStep(store, runB.run.id); // → 4

  await note(
    store,
    runB.run.id,
    stepAt(runB.steps, 4).id,
    "Master mix préparé pour 24 réactions (excès 10 %) — total du mix partagé 475,2 µL (master mix 2× : 264 µL, eau nuclease-free : 184,8 µL), volumes calculés par Octopus."
  );
  await advanceStep(store, runB.run.id); // → 5
  await advanceStep(store, runB.run.id); // 5 done → 6

  await note(store, runB.run.id, stepAt(runB.steps, 6).id, "NTC inclus (eau à la place du cDNA).");
  await advanceStep(store, runB.run.id); // → 7

  await note(store, runB.run.id, stepAt(runB.steps, 7).id, "Plaque scellée et centrifugée.");
  await advanceStep(store, runB.run.id); // → 8

  await deviation(store, runB.run.id, stepAt(runB.steps, 8).id, {
    expected: "Hybridation/élongation à 60 °C, 60 s à chaque cycle.",
    actual: "Thermocycleur mal programmé : hybridation réalisée à 55 °C.",
    reason: "Erreur de saisie du programme avant lancement.",
    severity: "critical",
  });
  await measurement(store, runB.run.id, stepAt(runB.steps, 8).id, {
    name: "Ct échantillon 1",
    value: 23.1,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await measurement(store, runB.run.id, stepAt(runB.steps, 8).id, {
    name: "Ct échantillon 2",
    value: 23.4,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await measurement(store, runB.run.id, stepAt(runB.steps, 8).id, {
    name: "Ct échantillon 3",
    value: 23.2,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await measurement(store, runB.run.id, stepAt(runB.steps, 8).id, {
    name: "Ct échantillon 4",
    value: 35.8, // mesure aberrante : très éloignée des 3 autres réplicats (~23,2)
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await note(
    store,
    runB.run.id,
    stepAt(runB.steps, 8).id,
    "Ct échantillon 4 anormalement élevé (35,8) comparé aux 3 autres réplicats (~23,2) — suspicion de contamination croisée ou d'échec de pipetage, à réexaminer."
  );
  await advanceStep(store, runB.run.id); // → 9

  await note(
    store,
    runB.run.id,
    stepAt(runB.steps, 9).id,
    "Melt curve : pics multiples détectés sur 2 puits — cohérent avec l'hybridation non spécifique liée à la déviation de température relevée à l'étape de cyclage."
  );
  await advanceStep(store, runB.run.id); // → 10

  await measurement(store, runB.run.id, stepAt(runB.steps, 10).id, {
    name: "Écart réplicats techniques (hors échantillon 4)",
    value: 0.3,
    unit: "Ct",
    instrument: "QuantStudio 5",
  });
  await deviation(store, runB.run.id, stepAt(runB.steps, 10).id, {
    expected: "Lecture immédiatement après la fin du run.",
    actual: "Plaque laissée 20 min dans le bloc avant lecture.",
    reason: "Second thermocycleur occupé par un autre run.",
    severity: "minor",
  });
  await advanceStep(store, runB.run.id); // 10 done, aucune étape suivante

  const ctxB = await getRunContext(store, runB.run.id);
  const runBCompleted = await completeRun(store, runB.run.id);
  const reportB = await generateReport(store, runB.run.id); // repli hors-ligne si pas de clé LLM
  await linkReportToRun(store, reportB.id, runB.run.id); // best-effort, cf. lib/rag.ts
  if (ctxB) await indexRun(store, runBCompleted, ctxB.protocol.title, ctxB.steps);
  const markdownB = await exportReportMarkdown(store, runB.run.id);
  await indexReport(store, reportB, markdownB);
  console.log(`✓ Run complété (déviation critique + mesure aberrante) : ${runB.run.id} — 24 réactions`);
  console.log(`✓ Rapport généré : ${reportB.id}`);

  // ── Run C : actif, à mi-parcours (12 réactions) ─────────────────────────
  const runC = await startRun(store, WS, {
    operator: OPERATOR,
    protocolId: ref.id,
    protocolVersion: ref.version,
    params: { n_reactions: 12, overage_pct: 10 },
  });
  await linkRunToProtocol(store, runC.run.id, ref.id); // best-effort, cf. lib/rag.ts

  await measurement(store, runC.run.id, stepAt(runC.steps, 0).id, {
    name: "Concentration ARN total",
    value: 703,
    unit: "ng/µL",
    instrument: "Nanodrop 2000",
  });
  await advanceStep(store, runC.run.id); // → 1

  await note(store, runC.run.id, stepAt(runC.steps, 1).id, "Mix RT assemblé sur glace.");
  await advanceStep(store, runC.run.id); // → 2

  await note(store, runC.run.id, stepAt(runC.steps, 2).id, "Programme RT en cours (42 °C).");
  await advanceStep(store, runC.run.id); // → 3

  await note(store, runC.run.id, stepAt(runC.steps, 3).id, "cDNA dilué 1:10.");
  await advanceStep(store, runC.run.id); // → 4

  await note(store, runC.run.id, stepAt(runC.steps, 4).id, "Master mix préparé pour 12 réactions (excès 10 %).");
  await advanceStep(store, runC.run.id); // 4 done → 5 active : run à mi-parcours (5/11 étapes)

  const ctxC = await getRunContext(store, runC.run.id);
  if (ctxC) await indexRun(store, ctxC.run, ctxC.protocol.title, ctxC.steps);
  console.log(`✓ Run actif à mi-parcours : ${runC.run.id} — 12 réactions (5/11 étapes faites)`);

  // ── Dossiers de l'explorateur (rangement des rapports) ──────────────────
  const qpcrFolder = await store.insertFolder({ ws: WS, name: "qPCR runs" });
  const archiveFolder = await store.insertFolder({ ws: WS, name: "Archive 2024" });
  await store.setPageFolder(reportB.id, qpcrFolder.id); // déviation critique : rapport à suivre
  await store.setPageFolder(reportA.id, archiveFolder.id); // run propre : classé
  console.log(`✓ Dossiers créés : « ${qpcrFolder.name} », « ${archiveFolder.name} »`);
  console.log(`✓ Rapports rangés : ${reportB.id} → « ${qpcrFolder.name} », ${reportA.id} → « ${archiveFolder.name} »`);

  // ── Résumé ───────────────────────────────────────────────────────────
  const [evA, evB, evC] = await Promise.all([
    listEvidence(store, runA.run.id),
    listEvidence(store, runB.run.id),
    listEvidence(store, runC.run.id),
  ]);

  console.log("\n— Résumé —");
  console.log(`Protocoles publiés : 2`);
  console.log(`Runs : 3 (2 complétés, 1 actif) — preuves : ${evA.length + evB.length + evC.length}`);
  console.log(`Rapports générés : 2 (runs ${runA.run.id}, ${runB.run.id})`);
  console.log(`Dossiers : 2 (« ${qpcrFolder.name} », « ${archiveFolder.name} ») — 2 rapports rangés`);

  console.log(`\nOuvre ${BASE_URL}/ (npm run dev) — le bureau Octopus. Depuis la toolbar :`);
  console.log(`  Bench → protocole « ${ref.title} » (référence) et « ${bradford.title} »`);
  console.log(`  Bench → run actif à mi-parcours : ${runC.run.id}`);
  console.log(`  Bench → rapport généré (déviation critique) : run ${runB.run.id}`);
  console.log(`  Files → dossiers « ${qpcrFolder.name} » et « ${archiveFolder.name} » avec des rapports rangés`);
  console.log(`  Cartouche du bas → « Ask your lab » pour interroger la mémoire du labo`);

  store.close();
}

main().catch((e: unknown) => {
  console.error("Échec du seed :", e);
  process.exitCode = 1;
});

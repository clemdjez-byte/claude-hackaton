// app/api/demo/run/route.ts — un run RT-qPCR complet en un appel : démarre à 24
// réactions, capture une note + une mesure + la déviation critique 55 °C, avance,
// puis clôt (rapport + mémoire + graphe). Pratique pour la démo et les tests e2e.
import { getDb } from "@/lib/core";
import { DEMO_WS, DEMO_OPERATOR, ensureSeed, finishRun } from "@/lib/orchestrate";
import { listProtocols } from "@/features/protocol-studio";
import { startRun, advanceStep } from "@/features/live-bench";
import { captureNote, captureMeasurement, captureDeviation } from "@/features/evidence-capture";

export async function POST() {
  const db = getDb();
  await ensureSeed(db);
  const proto = (await listProtocols(db, DEMO_WS))[0];
  if (!proto) return Response.json({ error: "Aucun protocole." }, { status: 500 });

  const ctx = await startRun(db, DEMO_WS, {
    operator: DEMO_OPERATOR,
    protocolId: proto.id,
    params: { n_reactions: 24, overage_pct: 10 },
  });
  const runId = ctx.run.id;
  const mmStep = ctx.steps.find((s) => /master mix qpcr/i.test(s.title)) ?? ctx.steps[0];

  await captureNote(db, runId, mmStep.id, "SYBR protégé de la lumière ; NTC inclus.", DEMO_OPERATOR);
  await captureMeasurement(db, runId, mmStep.id, { name: "Ct GAPDH", value: 21.4, unit: "Ct" }, DEMO_OPERATOR);
  await captureDeviation(
    db,
    runId,
    mmStep.id,
    { expected: "hybridation 60 °C", actual: "hybridation 55 °C", severity: "critical", reason: "consigne mal réglée — risque de primer-dimers en SYBR" },
    DEMO_OPERATOR
  );
  // Dérouler toutes les étapes pour un rapport de démo complet.
  for (let i = 0; i < ctx.steps.length; i++) {
    const { active } = await advanceStep(db, runId);
    if (!active) break;
  }
  await finishRun(db, runId);

  return Response.json({ runId, runUrl: `/run/${runId}`, reportUrl: `/report/${runId}` });
}

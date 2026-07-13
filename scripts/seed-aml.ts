// scripts/seed-aml.ts — populate Octopus with the AML/FLT3 multi-year notebook
// (6 protocols + 53 signed runs, 2021–2025). Pipeline lives in ./seed-lib.
// Run: `npm run seed-aml` (resets octopus.db first). AML_ONLY=P1 for a smoke test.
// Needs ANTHROPIC_API_KEY (KG + report interpretation) + VOYAGE_API_KEY (RAG).
import { getBenchSession } from "@/lib/session";
import { AML_DRAFTS } from "./aml-protocols";
import { P1_RUNS } from "./aml-runs-p1";
import { P2_RUNS } from "./aml-runs-p2";
import { P3_RUNS } from "./aml-runs-p3";
import { P4_RUNS } from "./aml-runs-p4";
import { P5_RUNS } from "./aml-runs-p5";
import { P6_RUNS } from "./aml-runs-p6";
import { seedPlans, backdate, type SeedPlan } from "./seed-lib";

const OPERATOR = "Emmanuel Djezvedjian";

const PLANS: SeedPlan[] = [
  { key: "P1", draft: AML_DRAFTS.P1, runs: P1_RUNS },
  { key: "P2", draft: AML_DRAFTS.P2, runs: P2_RUNS },
  { key: "P3", draft: AML_DRAFTS.P3, runs: P3_RUNS },
  { key: "P4", draft: AML_DRAFTS.P4, runs: P4_RUNS },
  { key: "P5", draft: AML_DRAFTS.P5, runs: P5_RUNS },
  { key: "P6", draft: AML_DRAFTS.P6, runs: P6_RUNS },
];

async function main(): Promise<void> {
  const { store } = getBenchSession();
  const only = process.env.AML_ONLY?.trim(); // e.g. "P1" for a smoke test
  const plans = only ? PLANS.filter((p) => p.key === only) : PLANS;

  console.log(`Octopus — AML/FLT3 seed${only ? ` (only ${only})` : ""}\n`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY missing — KG will be near-empty.");
  if (!process.env.VOYAGE_API_KEY) console.warn("⚠️  VOYAGE_API_KEY missing — RAG will not index.\n");

  const { runStamps, protoStamps } = await seedPlans(store, plans, OPERATOR);
  store.close();

  console.log("Backdating timestamps (2021–2025)…");
  backdate(runStamps, protoStamps);

  console.log(`\n— Done — ${runStamps.length} signed runs across ${plans.length} protocols.`);
  console.log("Open the app (npm run dev): Bench for protocols/runs, 'Ask your lab' for the KG/RAG.");
}

main().catch((e: unknown) => {
  console.error("AML seed failed:", e);
  process.exitCode = 1;
});

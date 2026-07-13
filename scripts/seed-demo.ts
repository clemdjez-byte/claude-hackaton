// scripts/seed-demo.ts — ADDITIVE seed: appends the 2 flagship "demo" protocols
// (D1 synergy, D2 CFU — 8 real steps each + the auto "Results" step) and their 20
// signed runs to the EXISTING octopus.db WITHOUT resetting. Most runs fill the
// Result section (via RunSpec.result → the Results step); a couple stay empty to
// show the unfilled/placeholder state. Run AFTER seed-aml/seed-fluo, or `seed-all`.
// Needs ANTHROPIC_API_KEY (KG + report interpretation) + VOYAGE_API_KEY (RAG).
import { getBenchSession } from "@/lib/session";
import { DEMO_DRAFTS } from "./demo-protocols";
import { D1_RUNS } from "./demo-runs-d1";
import { D2_RUNS } from "./demo-runs-d2";
import { seedPlans, backdate, type SeedPlan } from "./seed-lib";

const OPERATOR = "Emmanuel Djezvedjian";

const PLANS: SeedPlan[] = [
  { key: "D1", draft: DEMO_DRAFTS.D1, runs: D1_RUNS },
  { key: "D2", draft: DEMO_DRAFTS.D2, runs: D2_RUNS },
];

async function main(): Promise<void> {
  const { store } = getBenchSession();
  const only = process.env.DEMO_ONLY?.trim(); // e.g. "D1" for a smoke test
  const plans = only ? PLANS.filter((p) => p.key === only) : PLANS;

  console.log(`Octopus — demo protocols seed (additive)${only ? ` (only ${only})` : ""}\n`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY missing — KG will be near-empty.");
  if (!process.env.VOYAGE_API_KEY) console.warn("⚠️  VOYAGE_API_KEY missing — RAG will not index.\n");

  const { runStamps, protoStamps } = await seedPlans(store, plans, OPERATOR);
  store.close();

  console.log("Backdating timestamps (2024–2025)…");
  backdate(runStamps, protoStamps);

  console.log(`\n— Done — ${runStamps.length} signed demo runs across ${plans.length} protocols (added to existing data).`);
}

main().catch((e: unknown) => {
  console.error("Demo seed failed:", e);
  process.exitCode = 1;
});

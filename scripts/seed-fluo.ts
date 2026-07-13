// scripts/seed-fluo.ts — ADDITIVE seed: appends the fluorescent-labeling notebook
// (6 protocols F1–F6 + ~45 signed runs, 2023–2026) to the EXISTING octopus.db
// WITHOUT resetting. Run AFTER seed-aml: `npm run seed-fluo` (or `npm run seed-all`).
// Needs ANTHROPIC_API_KEY (KG + report interpretation) + VOYAGE_API_KEY (RAG).
import { getBenchSession } from "@/lib/session";
import { FLUO_DRAFTS } from "./fluo-protocols";
import { F1_RUNS } from "./fluo-runs-f1";
import { F2_RUNS } from "./fluo-runs-f2";
import { F3_RUNS } from "./fluo-runs-f3";
import { F4_RUNS } from "./fluo-runs-f4";
import { F5_RUNS } from "./fluo-runs-f5";
import { F6_RUNS } from "./fluo-runs-f6";
import { seedPlans, backdate, type SeedPlan } from "./seed-lib";

const OPERATOR = "Emmanuel Djezvedjian";

const PLANS: SeedPlan[] = [
  { key: "F1", draft: FLUO_DRAFTS.F1, runs: F1_RUNS },
  { key: "F2", draft: FLUO_DRAFTS.F2, runs: F2_RUNS },
  { key: "F3", draft: FLUO_DRAFTS.F3, runs: F3_RUNS },
  { key: "F4", draft: FLUO_DRAFTS.F4, runs: F4_RUNS },
  { key: "F5", draft: FLUO_DRAFTS.F5, runs: F5_RUNS },
  { key: "F6", draft: FLUO_DRAFTS.F6, runs: F6_RUNS },
];

async function main(): Promise<void> {
  const { store } = getBenchSession();
  const only = process.env.FLUO_ONLY?.trim(); // e.g. "F1" for a smoke test
  const plans = only ? PLANS.filter((p) => p.key === only) : PLANS;

  console.log(`Octopus — fluorescent-labeling seed (additive)${only ? ` (only ${only})` : ""}\n`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY missing — KG will be near-empty.");
  if (!process.env.VOYAGE_API_KEY) console.warn("⚠️  VOYAGE_API_KEY missing — RAG will not index.\n");

  const { runStamps, protoStamps } = await seedPlans(store, plans, OPERATOR);
  store.close();

  console.log("Backdating timestamps (2023–2026)…");
  backdate(runStamps, protoStamps);

  console.log(`\n— Done — ${runStamps.length} signed fluo runs across ${plans.length} protocols (added to existing data).`);
}

main().catch((e: unknown) => {
  console.error("Fluo seed failed:", e);
  process.exitCode = 1;
});

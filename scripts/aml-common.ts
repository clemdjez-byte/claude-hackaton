// scripts/aml-common.ts — shared types for the AML/FLT3 notebook seed.
// The run-spec is the free-text material the pipeline turns into a signed report
// and the AI turns into the knowledge graph (reagents, cell lines, parameter
// values, failure modes). Keep notes rich and in ENGLISH; notes[0] should state
// the historical date + operator so the KG date node comes out historical.
import type { Verdict } from "@/lib/core";

export interface RunSpec {
  /** short kebab slug, for logs/debug */
  slug: string;
  /** historical date YYYY-MM-DD (backdated after the pipeline runs) */
  date: string;
  /** e.g. "MOLM-14 (heterozygous FLT3-ITD)" — named in prose for the KG */
  cellLine: string;
  /** applied parameters (numbers) — seed startRun scalingContext; real values also live in notes */
  params: Record<string, number>;
  /** rich English observations; notes[0] should mention the date + operator */
  notes: string[];
  /** optional primary metric captured as a measurement evidence */
  measurement?: { name: string; value: number; unit: string };
  /** optional protocol deviation (drives the report Deviations section + KG failure_mode) */
  deviation?: {
    expected: string;
    actual: string;
    reason?: string;
    severity: "minor" | "major" | "critical";
  };
  /** optional result attached to the protocol's auto "Results" step → fills the
   *  report's Result section (leave undefined to show the empty/placeholder state) */
  result?: { note?: string; measurement?: { name: string; value: number; unit: string } };
  /** empirical verdict saved as Outcome (KG reuses it) */
  verdict: Verdict;
  /** causal "why" for partial/failure — becomes attributed_to → failure_mode */
  reason?: string;
}

export interface ProtocolPlan {
  key: string; // "P1".."P6"
  runs: RunSpec[];
}

// scripts/aml-runs-p5.ts — run inventory for Protocol P5
// "Acquired resistance modeling + FLT3-TKD mutation (Sanger)".
// This is the resistance STORY: chronic quizartinib escalation on MOLM-14 →
// the resistant subline MOLM-14-QuizR (name kept identical across runs so it
// hubs in the KG) → Sanger of the FLT3-TKD (D835Y, F691L gatekeeper) →
// cross-resistance, benchmarked against the naïve baseline (quizartinib MOLM-14
// IC50 ~2 nM, 2021-09-13). Each RunSpec becomes a started run → evidence →
// signed report → outcome → RAG + KG. Notes are the free text the AI reads to
// build the graph; keep them English and factual. Param keys (numbers only):
// escalation_dose (nM), culture_weeks (weeks), drug_concentration (nM, IC50 challenge).
import type { RunSpec } from "./aml-common";

export const P5_RUNS: RunSpec[] = [
  // 1 ── 2023-06-26 · start chronic quizartinib escalation on MOLM-14 (~1 nM) · success (week 0)
  {
    slug: "quizartinib-escalation-start",
    date: "2023-06-26",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { escalation_dose: 1, culture_weeks: 0 },
    notes: [
      "2023-06-26 · operator Emmanuel Djezvedjian. Opened the acquired-resistance arm of the campaign: started chronic quizartinib (AC220) dose-escalation on naïve MOLM-14 (heterozygous FLT3-ITD) to select a resistant subline, beginning at ~1 nM.",
      "Starting dose set just below the naïve IC50 — quizartinib on MOLM-14 is ~2 nM (cf. the 2021-09-13 baseline, IC50 1.9 nM) — so 1 nM applies sub-lethal selective pressure without collapsing the culture.",
      "Seeded log-phase MOLM-14 in RPMI-1640 + 10% FBS with 1 nM quizartinib; per the P5 dose-escalate step the plan is to raise the dose only when growth recovers to a near-normal doubling time.",
      "Week 0 of selection: the culture tolerated 1 nM with a ~26 h doubling and > 90% viability — a clean start with clear headroom to escalate slowly.",
      "This seed culture is the origin of the future MOLM-14-QuizR subline; banked a clean ~1 nM intermediate before the first dose step, as the protocol requires.",
    ],
    measurement: { name: "Weeks under selection", value: 0, unit: "weeks" },
    verdict: "success",
  },

  // 2 ── 2023-08-21 · escalation raised too fast (~1→20 nM) → mass death · FAILURE (step too large)
  {
    slug: "escalation-too-fast-mass-death",
    date: "2023-08-21",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD, under quizartinib selection)",
    params: { escalation_dose: 20, culture_weeks: 8 },
    notes: [
      "2023-08-21 · operator Emmanuel Djezvedjian. Continued the quizartinib (AC220) dose-escalation on the MOLM-14 selection culture (cf. the 2023-06-26 start) — recorded here as a failed escalation step with root-cause analysis.",
      "Against the protocol's 'escalate slowly' rule, the dose was jumped ~1 → 20 nM in a single step, skipping the intermediate 2 / 5 / 10 nM rungs, to try to speed up selection.",
      "The ~20-fold jump landed far above the naïve IC50 (~2 nM, cf. 2021-09-13): the culture underwent mass death within 72 h — viability fell to ~8%, the medium cleared, and no resistant fraction recovered over the following two weeks.",
      "Root cause is an escalation step that was too large — a fast dose jump kills the whole culture before any resistant clone can be selected, exactly the P5 ⚠️ failure mode. No contamination or reagent fault (parallel naïve MOLM-14 grew normally).",
      "Corrective action: restart from a banked ~1 nM intermediate and escalate in small ≤ 2× steps, raising the dose only after growth recovers at each rung.",
    ],
    measurement: { name: "Viability after 1→20 nM jump", value: 8, unit: "% viability" },
    deviation: {
      expected: "escalate in small steps (≤ ~2× per rung), raising dose only when growth recovers",
      actual: "single ~1 → 20 nM jump (~20× step)",
      reason: "escalation step too large → mass death before a resistant clone could be selected",
      severity: "major",
    },
    verdict: "failure",
    reason: "escalation step too large: ~1→20 nM jump caused mass death, culture lost before resistance could emerge",
  },

  // 3 ── 2023-10-16 · MOLM-14-QuizR established, grows at ~100 nM (~16 weeks) · success
  {
    slug: "molm14-quizr-established",
    date: "2023-10-16",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100, culture_weeks: 16 },
    notes: [
      "2023-10-16 · operator Emmanuel Djezvedjian. Milestone: the resistant subline MOLM-14-QuizR is established — after slow, stepwise escalation it grows stably at ~100 nM quizartinib (AC220), ~16 weeks from the 2023-06-26 start.",
      "Following the restart the dose was raised in small steps (1 → 2 → 5 → 10 → 25 → 50 → 100 nM), advancing only when the doubling time normalized at each rung and banking a clean intermediate at every step (per the P5 confirm-resistance rule).",
      "At 100 nM quizartinib MOLM-14-QuizR now grows with a ~28 h doubling and > 90% viability — a concentration that fully kills naïve MOLM-14 (~7% viability plateau at ≥ 100 nM, cf. the 2021-09-13 baseline).",
      "~16 weeks under selection to reach 100 nM tolerance; MOLM-14-QuizR is now the working resistant stock every downstream Sanger and cross-resistance run is performed on.",
    ],
    measurement: { name: "Weeks to established resistance", value: 16, unit: "weeks" },
    verdict: "success",
  },

  // 4 ── 2023-12-11 · gDNA extraction for TKD genotyping · FAILURE (low yield → PCR failed)
  {
    slug: "quizr-gdna-extraction-failed",
    date: "2023-12-11",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100, culture_weeks: 24 },
    notes: [
      "2023-12-11 · operator Emmanuel Djezvedjian. Genomic-DNA extraction from MOLM-14-QuizR (the subline established 2023-10-16) for FLT3-TKD genotyping — recorded as a failed extraction / genotyping attempt.",
      "Extracted gDNA with the QIAamp DNA Mini Kit from a pellet that proved too small and partly non-viable, then set up the FLT3 TKD PCR for downstream Sanger.",
      "Yield was far below spec — ~6 ng/µL at A260/280 ~1.5 versus the ≥ 50 ng/µL, clean-ratio input the PCR needs — and the FLT3-TKD PCR failed (no/weak amplicon on the gel), so no sequence could be read.",
      "Root cause is input DNA below spec: low gDNA yield and poor purity from an under-sized, partly apoptotic pellet — the P5 ⚠️ failure mode for genotyping. Not a primer or thermocycler fault, since control gDNA amplified normally in the same run.",
      "Corrective action: re-extract from a larger, healthy log-phase MOLM-14-QuizR pellet (≥ 5 × 10^6 cells), confirm ≥ 50 ng/µL and A260/280 ~1.8, then repeat the PCR (done 2024-02-12).",
    ],
    measurement: { name: "gDNA yield", value: 6, unit: "ng/µL" },
    deviation: {
      expected: "≥ 50 ng/µL clean gDNA (A260/280 ~1.8) input to the FLT3-TKD PCR",
      actual: "~6 ng/µL at A260/280 ~1.5 → PCR failed",
      reason: "input DNA below spec (low yield/purity from an under-sized, partly non-viable pellet)",
      severity: "major",
    },
    verdict: "failure",
    reason: "low gDNA yield/purity (input DNA below spec) → FLT3-TKD PCR failed, no genotype obtained",
  },

  // 5 ── 2024-02-12 · Sanger of FLT3-TKD on MOLM-14-QuizR reveals D835Y · success (mechanism)
  {
    slug: "quizr-tkd-sanger-d835y",
    date: "2024-02-12",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100 },
    notes: [
      "2024-02-12 · operator Emmanuel Djezvedjian. Mechanism identified: Sanger sequencing of the FLT3 tyrosine-kinase domain (TKD) on MOLM-14-QuizR reveals a secondary D835Y mutation.",
      "Re-extracted clean gDNA (this time ≥ 50 ng/µL at A260/280 ~1.8 — cf. the failed 2023-12-11 attempt), PCR-amplified the FLT3 TKD activation loop and Sanger-sequenced on the ABI 3500 Genetic Analyzer.",
      "The chromatogram shows a clear GAT→TAT change at codon 835 (D835Y) at ~48% variant allele fraction — a heterozygous secondary TKD mutation absent from the naïve parent line.",
      "D835Y is a canonical activation-loop substitution that stabilizes the active kinase and sterically blocks type-II binders like quizartinib — the mechanistic explanation for the resistance selected on this subline, consistent with biorxiv-2022.04.15.488522.",
      "Predicts quizartinib cross-resistance (to be quantified) while type-I inhibitors gilteritinib (ASP2215) and crenolanib should retain activity — the cross-resistance payoff the project set out to demonstrate.",
    ],
    measurement: { name: "FLT3-TKD D835Y variant allele fraction", value: 48, unit: "%" },
    verdict: "success",
  },

  // 6 ── 2024-04-15 · second QuizR subline, Sanger reveals F691L gatekeeper · success
  {
    slug: "quizr-tkd-sanger-f691l",
    date: "2024-04-15",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100 },
    notes: [
      "2024-04-15 · operator Emmanuel Djezvedjian. A second, independently derived MOLM-14-QuizR subline was Sanger-sequenced across the FLT3 TKD and carries the F691L gatekeeper mutation.",
      "This subline came from a separate escalation lineage (same slow-step protocol, same ~1 nM start as 2023-06-26) that reached quizartinib tolerance by a different route; it keeps the identical MOLM-14-QuizR name as it is the same parent line under the same selection.",
      "Sanger of the TKD shows a TTC→CTC change at codon 691 (F691L) at ~45% VAF — the classic gatekeeper substitution that reshapes the drug-binding pocket at the hinge.",
      "F691L is a distinct escape route from the D835Y subline (cf. 2024-02-12): two different FLT3-TKD mutations — the D835Y activation-loop and the F691L gatekeeper — both confer quizartinib resistance, exactly the two mechanisms flagged in the P5 protocol and biorxiv-2022.04.15.488522.",
      "F691L is the harder case (it can blunt some next-generation TKIs), but gilteritinib generally retains meaningful activity against it — to be tested on the salvage arm.",
    ],
    measurement: { name: "FLT3-TKD F691L variant allele fraction", value: 45, unit: "%" },
    verdict: "success",
  },

  // 7 ── 2024-06-17 · quizartinib IC50 on MOLM-14-QuizR shifted ~50× (~100 nM vs ~2 nM) · failure
  {
    slug: "quizr-quizartinib-crossresistance-ic50",
    date: "2024-06-17",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100, drug_concentration: 1000 },
    notes: [
      "2024-06-17 · operator Emmanuel Djezvedjian. Cross-resistance readout: quizartinib (AC220) 72 h CellTiter-Glo dose-response on MOLM-14-QuizR vs a naïve MOLM-14 control — the quantitative proof of acquired resistance.",
      "Ran the P2 dose-response (8-point 0.1–1000 nM, DMSO held at 0.1%, 72 h) side by side on MOLM-14-QuizR (the D835Y subline, cf. 2024-02-12) and naïve MOLM-14.",
      "Quizartinib IC50 on MOLM-14-QuizR is ~100 nM (95% CI ~80–125) versus ~2 nM on naïve MOLM-14 (cf. the 2021-09-13 baseline, IC50 1.9 nM) — a ~50-fold right-shift, matching the ~50× shift the P5 protocol predicts.",
      "The curve is right-shifted with a raised kill plateau: 100 nM, which fully kills naïve cells, barely dents the subline — the pharmacological signature of secondary FLT3-TKD (D835Y) resistance.",
      "Verdict failure = quizartinib has lost efficacy on this subline; documenting that loss is the intended, informative endpoint that motivates the gilteritinib/crenolanib salvage runs.",
    ],
    measurement: { name: "IC50 (quizartinib on MOLM-14-QuizR)", value: 100, unit: "nM" },
    deviation: {
      expected: "naïve-level quizartinib sensitivity (IC50 ~2 nM, cf. 2021-09-13)",
      actual: "IC50 ~100 nM on MOLM-14-QuizR (~50× right-shift)",
      reason: "acquired secondary FLT3-TKD resistance (D835Y) blocks quizartinib binding",
      severity: "major",
    },
    verdict: "failure",
    reason: "quizartinib cross-resistance — IC50 shifted ~50× (~2 → ~100 nM) on MOLM-14-QuizR via FLT3-TKD D835Y",
  },

  // 8 ── 2024-08-19 · gilteritinib on MOLM-14-QuizR retains activity (IC50 ~20 nM) · success
  {
    slug: "quizr-gilteritinib-retains-activity",
    date: "2024-08-19",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100, drug_concentration: 1000 },
    notes: [
      "2024-08-19 · operator Emmanuel Djezvedjian. Salvage arm: gilteritinib (ASP2215) 72 h CellTiter-Glo dose-response on MOLM-14-QuizR — testing whether a type-I TKI retains activity against the quizartinib-resistant subline.",
      "Gilteritinib IC50 on MOLM-14-QuizR is ~20 nM (95% CI ~16–25) — only modestly above the ~15 nM naïve MOLM-14 gilteritinib baseline (cf. P2), i.e. essentially retained activity (< 2× shift).",
      "In stark contrast to quizartinib's ~50× loss on the same subline (cf. 2024-06-17), gilteritinib still kills MOLM-14-QuizR at low-nanomolar concentrations.",
      "Consistent with mechanism: gilteritinib is a type-I inhibitor that binds the active kinase conformation and tolerates the D835Y activation-loop mutation — the cross-resistance payoff of the project (biorxiv-2022.04.15.488522).",
      "Verdict success = gilteritinib is a rational salvage for quizartinib-resistant, D835Y-driven disease and the front-runner over crenolanib.",
    ],
    measurement: { name: "IC50 (gilteritinib on MOLM-14-QuizR)", value: 20, unit: "nM" },
    verdict: "success",
  },

  // 9 ── 2024-10-21 · crenolanib on D835Y subline retains activity but partial (IC50 ~40 nM) · partial
  {
    slug: "quizr-crenolanib-partial-activity",
    date: "2024-10-21",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant MOLM-14, heterozygous FLT3-ITD)",
    params: { escalation_dose: 100, drug_concentration: 1000 },
    notes: [
      "2024-10-21 · operator Emmanuel Djezvedjian. Second salvage arm: crenolanib 72 h CellTiter-Glo dose-response on the D835Y MOLM-14-QuizR subline (cf. 2024-02-12).",
      "Crenolanib IC50 is ~40 nM on MOLM-14-QuizR — active, and far better than quizartinib's ~100 nM (cf. 2024-06-17), but with a clearly higher IC50 and a shallower kill plateau than gilteritinib's ~20 nM (2024-08-19).",
      "Crenolanib (a type-I TKI) retains activity on D835Y as expected, but only partially: potency is measurably blunted versus a fully naïve response, so it clears the 'retains activity' bar without being a clean win.",
      "Still a viable salvage and consistent with crenolanib keeping activity against activation-loop TKD mutants, but ranked behind gilteritinib here — hence a partial verdict rather than a success.",
    ],
    measurement: { name: "IC50 (crenolanib on MOLM-14-QuizR)", value: 40, unit: "nM" },
    verdict: "partial",
    reason: "crenolanib retains activity on D835Y but with partially blunted potency (IC50 ~40 nM vs ~20 nM gilteritinib) — a partial, not full, salvage",
  },

  // 10 ── 2024-12-16 · third escalation attempt lost to contamination · FAILURE (contamination)
  {
    slug: "quizr-escalation-contamination-lost",
    date: "2024-12-16",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD, under quizartinib selection)",
    params: { escalation_dose: 10, culture_weeks: 6 },
    notes: [
      "2024-12-16 · operator Emmanuel Djezvedjian. A third quizartinib (AC220) escalation attempt, started to derive a fresh MOLM-14-QuizR lineage, was lost to microbial contamination — recorded as a failed selection run.",
      "Started a new slow-step escalation on naïve MOLM-14 (same ~1 nM start as 2023-06-26); by ~week 6, with the culture at ~10 nM quizartinib, the medium turned turbid with a pH shift and rod-shaped contaminants were visible under the CKX53.",
      "Broth/MycoAlert checks confirmed bacterial contamination; the flask and all derived intermediates were discarded before any resistant subline could be banked.",
      "Root cause is contamination (a sterility/handling lapse) — the other P5 ⚠️ way a selection culture is lost, distinct from the too-fast escalation that killed the 2023-08-21 attempt. The already-established MOLM-14-QuizR sublines (2023-10-16, 2024-02-12, 2024-04-15) were unaffected and remain the working resistant stocks.",
      "Corrective action: decontaminated the cabinet and incubator shelf, restarted from a clean banked ~1 nM intermediate, and reinforced aseptic technique through the long multi-week escalation.",
    ],
    measurement: { name: "Weeks under selection at loss", value: 6, unit: "weeks" },
    deviation: {
      expected: "sterile culture maintained through the multi-week escalation (bacteria/mycoplasma-negative)",
      actual: "bacterial contamination at ~week 6 → culture and intermediates discarded",
      reason: "contamination (sterility/handling lapse) lost the selection culture",
      severity: "critical",
    },
    verdict: "failure",
    reason: "third escalation lost to bacterial contamination before a resistant subline could be banked",
  },
];

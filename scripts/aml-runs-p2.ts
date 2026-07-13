// scripts/aml-runs-p2.ts — run inventory for Protocol P2
// "FLT3 TKI dose-response viability (CellTiter-Glo)".
// Each RunSpec is distilled from the rich English report in
// .context/aml-kg-notebook/experiments/ — same date, cell line, verdict and
// primary metric (IC50 nM, or the run's headline readout). Param keys
// (numbers only): drug_concentration (nM, top dose), incubation_time (h),
// dmso_pct (%), cell_density (cells/mL).
import type { RunSpec } from "./aml-common";

export const P2_RUNS: RunSpec[] = [
  // 1 ── 2021-09-13 · quizartinib × MOLM-14 · success · IC50 1.9 nM (baseline anchor)
  {
    slug: "quizartinib-doseresponse-molm14-baseline",
    date: "2021-09-13",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-09-13 · operator Emmanuel Djezvedjian. First TKI dose-response of the whole campaign: quizartinib (AC220) on MOLM-14 (heterozygous FLT3-ITD), 8-point ½-log serial dilution 0.1–1000 nM, 72 h exposure, final DMSO held at 0.1%.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL) into inner wells (columns 2–11) of a Corning 3917 white plate; PBS edge ring in place. Stock was p12, QC-passed and authenticated (STR + FLT3-ITD PCR + mycoplasma-negative, panel released 2021-05-24).",
      "Quizartinib dispensed with a Tecan D300e directly onto cells, DMSO back-filled isovolumetric to a uniform 0.1% in every well; 4 technical replicates per dose, CellTiter-Glo 2.0 read on a GloMax Discover.",
      "Clean monotone sigmoid, Hill slope ~1.0, near-complete kill (~7% viability plateau) at ≥ 100 nM; DMSO-vehicle CV < 1%, R² = 0.997.",
      "IC50 = 1.9 nM (95% CI 1.6–2.3). Establishes the MOLM-14/quizartinib baseline anchor every later drug × line comparison is read against — MV4-11 expected lower (~1 nM), the FLT3 wild-type THP-1 control spared until ≫ µM.",
    ],
    measurement: { name: "IC50", value: 1.9, unit: "nM" },
    verdict: "success",
  },

  // 2 ── 2021-09-27 · quizartinib × MV4-11 · success · IC50 0.9 nM (homozygous, lowest)
  {
    slug: "quizartinib-doseresponse-mv4-11",
    date: "2021-09-27",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-09-27 · operator Emmanuel Djezvedjian. Quizartinib (AC220) dose-response on MV4-11 (homozygous FLT3-ITD), ½-log 0.1–1000 nM, 72 h, DMSO 0.1%. Tests the gene-dosage prediction that the two-ITD-allele line is even more FLT3-addicted than the heterozygous MOLM-14 baseline (cf. the 2021-09-13 run, IC50 ~1.9 nM).",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL) from a p14 (≤ p20 cap), 96% viable log-phase stock of the 2021-05-24 QC-released panel; PBS edge ring, data confined to columns 2–11.",
      "D300e drug dispense with DMSO normalized to 0.1% across all wells; 4 technical replicates; plate Z′ = 0.82, no edge-well drift.",
      "IC50 ≈ 0.9 nM (95% CI 0.7–1.2), Hill slope ~1.0, deep bottom plateau ~3% viability — near-complete kill and clean single-target engagement.",
      "MV4-11 sits ~2× below the heterozygous MOLM-14 (~2 nM), exactly the direction FLT3-ITD gene dosage predicts; anchors the homozygous end of the WT < heterozygous < homozygous sensitivity gradient set at panel QC (2021-05-24).",
    ],
    measurement: { name: "IC50", value: 0.9, unit: "nM" },
    verdict: "success",
  },

  // 3 ── 2021-10-11 · quizartinib × THP-1 (WT control) · success · IC50 > 3000 nM
  {
    slug: "quizartinib-thp-1-wt-control",
    date: "2021-10-11",
    cellLine: "THP-1 (FLT3 wild-type)",
    params: { drug_concentration: 10000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-10-11 · operator Emmanuel Djezvedjian. Quizartinib (AC220) on THP-1 (FLT3 wild-type), the on-target control arm. ½-log series extended to 0.1–10 000 nM (10 µM) to reach the top of a very shallow curve; 72 h, DMSO 0.1%.",
      "THP-1 carries no FLT3-ITD and wild-type FLT3, so it is not FLT3-addicted; if the low-nM killing of the ITD lines were general cytotoxicity, THP-1 would die at similar doses. p11 stock, 96% viable, from the 2021-05-24 QC panel; PBS edge ring, columns 2–11, 4 technical replicates.",
      "Curve is top-heavy / shallow: viability ≥ 90% through 300 nM and only ~52% at the 10 µM ceiling; the lower asymptote is not reached. Hill slope ~0.7 — a weak non-specific tail, not on-target killing.",
      "IC50 > 3000 nM (≫ µM), reported as a lower bound because the curve does not plateau in range. Contrast the paired ITD runs: MOLM-14 ~2 nM (2021-09-13) and MV4-11 ~1 nM (2021-09-27).",
      "Selectivity window (THP-1 IC50 / MV4-11 IC50) > 1000× — the on-target specificity linchpin confirming quizartinib's low-nM potency reflects FLT3-ITD dependence, not general cytotoxicity.",
    ],
    measurement: { name: "IC50 (lower bound)", value: 3000, unit: "nM" },
    verdict: "success",
  },

  // 4 ── 2021-10-25 · DMSO vehicle tolerability × MOLM-14 · failure · viability 72% at 0.5% DMSO
  {
    slug: "dmso-vehicle-toxicity-failure",
    date: "2021-10-25",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 0, incubation_time: 72, dmso_pct: 0.5, cell_density: 50000 },
    notes: [
      "2021-10-25 · operator Emmanuel Djezvedjian. Vehicle-only tolerability check on MOLM-14 (heterozygous FLT3-ITD): DMSO titrated to 0.1 / 0.25 / 0.5 / 1.0% final with no TKI in any well, to fix the maximum tolerated solvent before pushing the campaign to a higher top dose.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL), p14, 96% viable from the 2021-05-24 QC panel; PBS edge ring, columns 2–11. DMSO added by the same manual serial-dilution scheme a drug plate would use.",
      "Clean monotonic drop with no drug present: viability 99% at 0.1% → 91% at 0.25% → 72% at 0.5% → 55% at 1.0%. The effect is solvent alone; replicate SD ≤ 2%, so the trend is real, not noise.",
      "This breaches the protocol's DMSO ≤ 0.1% ceiling. On a serial-dilution plate where DMSO scales with dose, the highest-drug wells carry the most solvent, so vehicle toxicity adds to drug killing at the top of the curve — left-shifting the fit and making a drug look artificially more potent (falsely low IC50, steepened apparent Hill).",
      "Root cause is plate-design / dilution scheme: solvent was allowed to scale with the top dose instead of being held isovolumetric. Corrective action — cap DMSO ≤ 0.1% in ALL wells and dispense with the D300e to decouple solvent from dose; re-run any curve whose top wells exceeded 0.1%.",
      "The earlier quizartinib (2021-09-13) and gilteritinib MOLM-14 curves remain valid — both held DMSO ≤ 0.1% isovolumetric across the plate — so those IC50s are untouched by this artefact; the confound is specific to the higher-top-dose design piloted here.",
    ],
    measurement: { name: "Viability at 0.5% DMSO", value: 72, unit: "% viability" },
    deviation: {
      expected: "final DMSO ≤ 0.1% in every well (held isovolumetric)",
      actual: "DMSO titrated to 0.25 / 0.5 / 1.0%, scaling with the intended top dose",
      reason: "vehicle allowed to co-vary with dose instead of being held constant",
      severity: "major",
    },
    verdict: "failure",
    reason: "DMSO vehicle independently cytotoxic above 0.1% (solvent confound left-shifts the IC50)",
  },

  // 5 ── 2021-11-15 · gilteritinib × MOLM-14 · success · IC50 15 nM (type I)
  {
    slug: "gilteritinib-doseresponse-molm14",
    date: "2021-11-15",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-11-15 · operator Emmanuel Djezvedjian. Gilteritinib (ASP2215), a type I FLT3/AXL inhibitor, dose-response on MOLM-14 (heterozygous FLT3-ITD), ½-log 0.1–1000 nM, 72 h, DMSO 0.1%. Companion to the quizartinib baseline on the same line (2021-09-13) — a type I vs type II on-target contrast.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL), p14 (≤ p20), 96% viable from the 2021-05-24 QC panel; D300e dispense with DMSO back-filled to 0.1%; PBS edge ring, columns 2–11; 4 technical replicates.",
      "Full monotonic sigmoid, Hill slope ~1.0, complete kill (≤ 6% viability) at ≥ 300 nM; Z′ = 0.71, R² = 0.996 — a textbook single-site on-target profile.",
      "IC50 = 15 nM (95% CI ~14–16). ~7–8× less potent than quizartinib (~2 nM) on MOLM-14, but the killing is genuine and complete — expected chemistry (type I binds the active DFG-in FLT3 conformation), not a weaker drug.",
      "Gilteritinib is the resistance front-runner for P5: as a type I inhibitor it should retain activity against quizartinib-resistant FLT3-TKD / gatekeeper mutants that disrupt type II binding — this 15 nM value is the sensitive baseline for those comparisons against MOLM-14-QuizR sublines.",
    ],
    measurement: { name: "IC50", value: 15, unit: "nM" },
    verdict: "success",
  },

  // 6 ── 2021-11-29 · gilteritinib × MV4-11 · success · IC50 8 nM
  {
    slug: "gilteritinib-doseresponse-mv4-11",
    date: "2021-11-29",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-11-29 · operator Emmanuel Djezvedjian. Gilteritinib (ASP2215) dose-response on MV4-11 (homozygous FLT3-ITD), ½-log 0.1–1000 nM, 72 h, DMSO 0.1%. Closes the gilteritinib arm; complements gilteritinib on MOLM-14 (~15 nM, 2021-11-15) and quizartinib on this same MV4-11 line (~1 nM, 2021-09-27).",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL), p16 (≤ p20), 96% viable from the 2021-05-24 QC panel; D300e dispense with DMSO matched at 0.1%; PBS edge ring, columns 2–11; 4 technical replicates.",
      "IC50 = 8 nM (95% CI ~7–9), Hill slope ~1.0 (0.97), deep bottom plateau ~3% viability; Z′ = 0.83, R² = 0.997 — clean on-target 1:1 killing, no off-target signature.",
      "MV4-11 (~8 nM) is ~2× more sensitive than heterozygous MOLM-14 (~15 nM), reproducing the ITD gene-dosage ordering already seen for quizartinib (MV4-11 ~1 nM < MOLM-14 ~2 nM). Absolute IC50 differs by drug class, but the relative line ranking is invariant.",
      "Across both drugs MV4-11 is the most TKI-sensitive line in the panel — two ITD alleles and no wild-type FLT3 leave it fully FLT3-dependent, so blocking the kinase is maximally lethal.",
    ],
    measurement: { name: "IC50", value: 8, unit: "nM" },
    verdict: "success",
  },

  // 7 ── 2021-12-13 · quizartinib × MOLM-14 · failure · outer-well CV 41% (edge evaporation, plate excluded)
  {
    slug: "edge-well-evaporation-failure",
    date: "2021-12-13",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2021-12-13 · operator Emmanuel Djezvedjian. Intended a replicate of the 2021-09-13 quizartinib (AC220) × MOLM-14 baseline (IC50 ~2 nM), ½-log 0.1–1000 nM, 72 h. Scored a plate-level failure: the PBS edge moat was omitted and cells/drug were pipetted into the outer wells.",
      "Seeded MOLM-14 p14, 96% viable, at 5 × 10^4 cells/mL. Deviation at seeding — the plate map was not restricted to the inner grid; row A/H and columns 1/12 were used as data wells instead of PBS fill.",
      "Over 72 h at 37 °C the outer ring lost ~20–35% of its volume; that concentrates medium / drug / DMSO, raises osmolarity and makes the ATP luminescence erratic. Outer DMSO-vehicle CV blew out to 41% (vs 8% inner) and the outer dose-response went non-monotonic.",
      "Because the 4-parameter fit is a global regression, the corrupted outer points destabilised the whole curve: non-convergent, IC50 ~0.4 nM with a 95% CI spanning > 3 log units and a flat Hill ~0.5 — meaningless. Full-plate Z′ ≈ 0.3 (< 0.5), an explicit exclusion flag.",
      "Inner-well-only fit (columns 2–11) gave IC50 ≈ 2 nM, Hill ~1.0 — consistent with the baseline and localising the fault to plate layout, not the cells, drug or reagents. Per protocol the plate is excluded rather than partially salvaged.",
      "Corrective action — always fill the edge ring with PBS before seeding, confine data to columns 2–11 / rows B–G, and auto-flag plates with outer/inner CV divergence or Z′ < 0.5. Re-run scheduled with the moat in place.",
    ],
    measurement: { name: "Outer-well DMSO-vehicle CV", value: 41, unit: "%" },
    deviation: {
      expected: "edge ring filled with PBS; data confined to inner wells (columns 2–11 / rows B–G)",
      actual: "PBS moat omitted, cells and drug pipetted into the evaporation-prone outer ring",
      reason: "72 h edge-well evaporation corrupted the outer replicates (CV 41%, Z′ ~0.3)",
      severity: "major",
    },
    verdict: "failure",
    reason: "PBS edge moat omitted → edge-well evaporation blew out replicate CV, fit non-convergent, plate excluded",
  },

  // 8 ── 2022-01-17 · midostaurin × MOLM-14 · success · IC50 20 nM (multi-kinase)
  {
    slug: "midostaurin-doseresponse-molm14",
    date: "2022-01-17",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2022-01-17 · operator Emmanuel Djezvedjian. Midostaurin (PKC412), the first-generation clinically approved multi-kinase FLT3 inhibitor, dose-response on MOLM-14 (heterozygous FLT3-ITD), 8-point ½-log 0.1–1000 nM, 72 h, DMSO 0.1%. Sets the clinically relevant reference (RATIFY combination) the more selective TKIs are judged against.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL), p16 (≤ p20), 96% viable from the 2021-05-24 QC panel; D300e dispense, DMSO 0.1% isovolumetric; PBS edge ring, columns 2–11; 4 technical replicates.",
      "Clean monotone sigmoid, Hill slope ~1.1, near-complete kill (~8% plateau) at ≥ 100 nM; DMSO-vehicle CV < 1%, R² = 0.996 — right-shifted vs quizartinib/gilteritinib but still on-target.",
      "IC50 = 20 nM (95% CI 18–22). Clean potency ranking on the same MOLM-14 baseline and identical plate format: quizartinib (~2 nM) < gilteritinib (~15 nM) < midostaurin (~20 nM).",
      "The lower potency fits midostaurin's mechanism — a broad multi-target inhibitor (FLT3, KIT, PKC, PDGFR, VEGFR) rather than FLT3-selective, so less of its activity is concentrated on the FLT3-ITD dependency. Hill ~1 and full plateau kill confirm the effect is still on-target, reframing it as a chemo-partner rather than a stand-alone FLT3 blocker.",
    ],
    measurement: { name: "IC50", value: 20, unit: "nM" },
    verdict: "success",
  },

  // 9 ── 2022-02-07 · sorafenib × MOLM-14 · partial · IC50 6 nM but steep Hill ~2.5 (off-target)
  {
    slug: "sorafenib-doseresponse-molm14-partial",
    date: "2022-02-07",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2022-02-07 · operator Emmanuel Djezvedjian. Sorafenib (a multi-kinase TKI: FLT3, RAF, VEGFR, PDGFR) dose-response on MOLM-14 (heterozygous FLT3-ITD), ½-log 0.1–1000 nM with an added 6 nM point to bracket the transition, 72 h, DMSO 0.1%. Run as a specificity check alongside the FLT3-selective quizartinib / gilteritinib.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL), p14, 95% viable from the 2021-05-24 QC panel; D300e dispense, DMSO 0.1%; PBS edge ring, columns 2–11; 4 technical replicates. Technically clean plate (DMSO-vehicle CV < 1%, no edge drift) — the curve shape is a real property of the drug.",
      "Two shape features stand out against the clean quizartinib/gilteritinib curves: an early shoulder (viability already ~77% by 3 nM) and a very steep central transition (77% → 50% → 23% across only 3 → 6 → 10 nM).",
      "IC50 = 6.0 nM (95% CI 5.2–6.9), numerically close to the FLT3-selective TKIs and to the canonical sorafenib MOLM-14 ~6 nM — but Hill slope ≈ 2.5, far steeper than the ~1.0 of a single-target curve. That trips the protocol's off-target ⚠️ threshold, so the run is graded partial despite a technically clean plate.",
      "Root cause is pharmacology / interpretation, not technique: the steep slope plus the shoulder are the fingerprint of multi-target killing (RAF/MEK-ERK, VEGFR, PDGFR), so a fraction of the effect may be FLT3-independent. The number is real but its specificity as a FLT3 readout is uncertain.",
      "Corrective action — counter-screen sorafenib on FLT3 wild-type THP-1 (extend to 10 000 nM) before trusting the MOLM-14 IC50; keep it out of the pooled FLT3-selective TKI set until the selectivity ratio is established. Standing rule: any Hill slope well above ~1.5 is flagged for a WT counter-screen before its IC50 is quoted as a FLT3 metric.",
    ],
    measurement: { name: "IC50", value: 6, unit: "nM" },
    deviation: {
      expected: "Hill slope ~1 (clean single-target, on-target dose-response)",
      actual: "Hill slope ~2.5 with an early sub-transition shoulder (steep, cooperative-looking)",
      reason: "multi-target / off-target killing (RAF/VEGFR/PDGFR) confounds the FLT3 attribution of the IC50",
      severity: "minor",
    },
    verdict: "partial",
    reason: "steep Hill ~2.5 flags off-target/non-specific killing — IC50 specificity as a FLT3 readout uncertain",
  },

  // 10 ── 2022-03-07 · quizartinib × MOLM-14 · partial · IC50 (48 h) 5 nM vs 72 h ~2 nM
  {
    slug: "incubation-48h-vs-72h-partial",
    date: "2022-03-07",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 48, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2022-03-07 · operator Emmanuel Djezvedjian. Method comparison on MOLM-14 (heterozygous FLT3-ITD): one quizartinib (AC220) 0.1–1000 nM series stamped onto sister plates from a single seeding, one plate read at 48 h and its twin at 72 h, to quantify how reading early biases the IC50.",
      "Seeded MOLM-14 p15, 96% viable, at 5 × 10^4 cells/mL into two Corning 3917 plates; D300e dispense, DMSO ≤ 0.1% normalized; PBS edge ring, columns 2–11; 4 technical replicates. The shared suspension makes the plates true sisters, so readout time is the only variable.",
      "48 h (Plate A): IC50 ≈ 5 nM (95% CI 3.6–6.9), Hill ~0.9, bottom plateau ~25% viability — an incomplete kill. 72 h (Plate B): IC50 ≈ 2 nM (95% CI 1.5–2.7), Hill ~1.0, plateau ~7% — full kill. Both plates Z′ > 0.5.",
      "Reading at 48 h inflates the apparent IC50 ~2.5× and leaves the kill floor ~3× higher (25% vs 7%). Quizartinib is a slow-acting type II TKI that kills by apoptosis over days; CellTiter-Glo tracks ATP, so committed-but-not-yet-dead cells still read as viable at 48 h.",
      "This is a biology-of-the-readout effect, not a pipetting / DMSO / edge artefact. The 48 h read is within the ≥ 48 h allowance, so no hard protocol breach — but deliberately sitting on the floor of the window under-reports cytotoxicity, so the run is graded partial: usable method-comparison data, not a headline IC50.",
      "Corrective action — lock 72 h as the campaign standard for every reported IC50; use 48 h reads only for kinetics, never for potency; flag any curve with a bottom plateau > ~15% viability as possible under-incubation and require a 72 h confirmation. The 5 nM 48 h figure must not be quoted as a potency value.",
    ],
    measurement: { name: "IC50 (48 h)", value: 5, unit: "nM" },
    deviation: {
      expected: "read at the 72 h standard exposure for a reported IC50",
      actual: "read at 48 h (the floor of the ≥ 48 h window) as the experimental variable",
      reason: "early read under-reports slow apoptotic kill → apparent IC50 inflated ~2.5× and plateau ~3× higher",
      severity: "minor",
    },
    verdict: "partial",
    reason: "48 h readout underestimates cytotoxicity (apoptosis incomplete) — IC50 inflated ~2.5× vs the 72 h standard",
  },

  // 11 ── 2022-04-11 · quizartinib × MOLM-14 · success · IC50 2.1 nM (biological replicate)
  {
    slug: "quizartinib-ic50-replicate-molm14",
    date: "2022-04-11",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2022-04-11 · operator Emmanuel Djezvedjian. Independent biological replicate of the 2021-09-13 quizartinib (AC220) × MOLM-14 baseline (IC50 ~1.9 nM), repeated ~7 months later with a fresh ≤ p20 thaw and a new quizartinib aliquot (lot S1526-09). 8-point ½-log 0.1–1000 nM, 72 h, DMSO 0.1%.",
      "Seeded 5,000 cells/well (5 × 10^4 cells/mL) from a fresh p6 thaw of the 2021-05-24 QC-released bank, 96% viable; deliberately reused the baseline RPMI/FBS lots so the two runs differ mainly in time, thaw and drug aliquot. D300e dispense, DMSO 0.1%; PBS edge ring, columns 2–11; 4 technical replicates.",
      "Clean sigmoid essentially superimposable on the baseline, Hill slope ~1.0, ~7% plateau kill; DMSO-vehicle CV < 1%, R² = 0.996.",
      "IC50 = 2.1 nM (95% CI 1.7–2.5) vs the baseline 1.9 nM (1.6–2.3) — a 1.1× difference, well inside the 2× reproducibility bar, overlapping CIs, matched Hill slope and ~7% plateau. Combined geometric-mean IC50 ≈ 2.0 nM, inter-assay CV ~12%.",
      "Agreement across a 7-month gap, an independent early-passage thaw and a fresh drug aliquot licenses treating the MOLM-14/quizartinib IC50 as a fixed anchor for the 2022-05-16 summary panel and the P5 resistance fold-shift comparisons.",
    ],
    measurement: { name: "IC50", value: 2.1, unit: "nM" },
    verdict: "success",
  },

  // 12 ── 2022-05-16 · cross-line panel (4 TKIs × 3 lines) · success · quizartinib THP-1/MV4-11 SI ~3000×
  {
    slug: "cross-line-ic50-summary-panel",
    date: "2022-05-16",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD), MV4-11 (homozygous FLT3-ITD), THP-1 (FLT3 wild-type)",
    params: { drug_concentration: 10000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2022-05-16 · operator Emmanuel Djezvedjian. Cross-line IC50 summary panel consolidating the whole P2 campaign into one selectivity matrix: 4 FLT3 TKIs (quizartinib, gilteritinib, midostaurin, sorafenib) × 3 lines (MOLM-14 heterozygous ITD, MV4-11 homozygous ITD, THP-1 wild-type), 72 h CellTiter-Glo, DMSO 0.1%.",
      "Part fresh confirmatory run — quizartinib and gilteritinib re-run side-by-side on all three lines from one common cell prep and one drug-plate stamp (removes day/plate confounders) — and part synthesis of the individual midostaurin (2022-01-17) and sorafenib (2022-02-07) fits. All three lines ≤ p20 from the 2021-05-24 QC panel; THP-1 extended to 10 000 nM; Z′ = 0.78, no edge drift.",
      "Master IC50 table: quizartinib ~2 nM (MOLM-14) / ~1 nM (MV4-11) / > 3000 nM (THP-1); gilteritinib ~15 / ~8 / > 1000; midostaurin ~20 / ~12 / > 2000; sorafenib ~6 (steep) / ~4 (steep) / > 1000. Hill slopes ~1.0–1.3 for all but sorafenib (~2.5, off-target caveat, cf. 2022-02-07).",
      "Selectivity indices (THP-1 IC50 ÷ ITD-line IC50, quoted as lower bounds): quizartinib > 1500× on MOLM-14 and > 3000× on MV4-11; all four drugs > 100× vs MV4-11. Primary metric — quizartinib THP-1/MV4-11 selectivity index ≈ 3000-fold.",
      "Reproduces the WT/het/hom addiction gradient MV4-11 < MOLM-14 ≪ THP-1: the homozygous ITD line is most addicted (lowest IC50), the heterozygous line intermediate, the WT control essentially insensitive. Confirms on-target FLT3 dependence as the mechanism of the panel's TKI sensitivity.",
      "Sorafenib is the off-target caveat — an attractive low-nM IC50 but steep Hill ~2.5, so its numbers are not read as clean FLT3 inhibition. This matrix is the frozen pre-resistance BASELINE: the P5 resistance shifts (MOLM-14-QuizR, FLT3-TKD mutations) will be scored as fold-changes in these exact IC50s.",
    ],
    measurement: { name: "Selectivity index (THP-1/MV4-11, quizartinib)", value: 3000, unit: "fold" },
    verdict: "success",
  },
];

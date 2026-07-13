// scripts/aml-runs-p4.ts — run-spec seed for protocol P4
// "Phospho-signaling Western blot (p-STAT5/p-AKT/p-ERK)".
// Param keys (numbers only): drug_concentration (nM), treatment_time (h),
// protein_load_ug (µg), transfer_time (min). Primary metric where sensible =
// p-STAT5 band intensity as % of DMSO control (100% = untreated).
import type { RunSpec } from "./aml-common";

export const P4_RUNS: RunSpec[] = [
  // 1 ── baseline p-STAT5/p-AKT/p-ERK, MOLM-14 vs THP-1 (untreated) ───────────
  {
    slug: "p4-baseline-molm14-vs-thp1",
    date: "2022-10-17",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD) vs THP-1 (FLT3 wild-type)",
    params: { drug_concentration: 0, treatment_time: 0, protein_load_ug: 25, transfer_time: 90 },
    notes: [
      "2022-10-17 · operator Emmanuel Djezvedjian. Baseline phospho-signalling panel (p-FLT3, p-STAT5, p-AKT, p-ERK1/2, total protein + β-actin loading control) on untreated MOLM-14 (heterozygous FLT3-ITD) versus THP-1 (FLT3 wild-type) — the pharmacodynamic reference every later TKI blot is read against.",
      "Log-phase cultures (p12, QC-passed against the 2022 working bank), lysed in ice-cold RIPA with fresh protease + phosphatase inhibitors; 25 µg protein/lane, 8% gel to resolve the high-MW FLT3 (~150–160 kDa), 90 min wet transfer to PVDF.",
      "MOLM-14 shows strong constitutive p-STAT5 and p-ERK1/2: the FLT3-ITD receptor signals ligand-independently, so STAT5 is phosphorylated with no added ligand (cf. Takahashi 2011, DOI 10.1186/1756-8722-4-13).",
      "THP-1 (FLT3-WT) is near-silent for p-STAT5 — densitometry gives ~15% of the MOLM-14 signal — confirming p-STAT5 as an FLT3-ITD-driven readout rather than a generic myeloid band.",
      "Defines 100% = untreated MOLM-14 p-STAT5 for all downstream normalisation (the 2022-11-14 quizartinib and 2022-12-12 gilteritinib blots are scored against this lane).",
    ],
    measurement: { name: "p-STAT5 in THP-1 relative to MOLM-14", value: 15, unit: "% of MOLM-14" },
    verdict: "success",
  },

  // 2 ── quizartinib 10 nM, MOLM-14, 2–4 h time-course ───────────────────────
  {
    slug: "p4-quizartinib-molm14-timecourse",
    date: "2022-11-14",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 4, protein_load_ug: 30, transfer_time: 90 },
    notes: [
      "2022-11-14 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM on MOLM-14 (heterozygous FLT3-ITD), phospho-signalling time-course lysed at 2 h and 4 h, DMSO-vehicle lane = 100% p-STAT5 (per the 2022-10-17 baseline).",
      "30 µg protein/lane, phosphatase inhibitor added fresh to the RIPA, 90 min transfer; probed p-STAT5, p-AKT and p-ERK1/2, then stripped and re-probed for total STAT5 and β-actin.",
      "p-STAT5 is essentially abolished by 2 h and stays down at 4 h — densitometry ~5% of DMSO control — the on-target pharmacodynamic signature of FLT3 inhibition that sits behind the low-nanomolar viability IC50 (~2 nM, P2).",
      "p-ERK1/2 clearly reduced (~40% of control) and p-AKT partially lowered: p-STAT5 is the most sensitive, most FLT3-proximal node of the three.",
      "Total STAT5 and β-actin are unchanged across lanes, so the collapse is phospho-specific and not a loading artefact.",
    ],
    measurement: { name: "p-STAT5 at 10 nM quizartinib (2 h)", value: 5, unit: "% of DMSO control" },
    verdict: "success",
  },

  // 3 ── gilteritinib 30 nM, MOLM-14, 2 h ────────────────────────────────────
  {
    slug: "p4-gilteritinib-molm14-2h",
    date: "2022-12-12",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 30, treatment_time: 2, protein_load_ug: 20, transfer_time: 90 },
    notes: [
      "2022-12-12 · operator Emmanuel Djezvedjian. Gilteritinib (ASP2215) 30 nM on MOLM-14 (heterozygous FLT3-ITD), single 2 h timepoint against a DMSO-vehicle control, matched to the 2022-11-14 quizartinib blot.",
      "20 µg protein/lane, fresh phosphatase inhibitor in the lysis buffer, 90 min PVDF transfer; p-STAT5 / p-AKT / p-ERK1/2 vs total protein and β-actin.",
      "Both p-STAT5 and p-ERK1/2 collapse to ~8% of DMSO control at 2 h — gilteritinib reproduces the quizartinib pharmacodynamics at a higher absolute dose, consistent with its higher viability IC50 (~15 nM vs quizartinib ~2 nM on MOLM-14).",
      "p-AKT is reduced but not fully abolished. Confirms on-target FLT3 blockade by a chemically distinct type-I TKI, cross-validating the p-STAT5 readout.",
    ],
    measurement: { name: "p-STAT5 at 30 nM gilteritinib (2 h)", value: 8, unit: "% of DMSO control" },
    verdict: "success",
  },

  // 4 ── FAILURE: phosphatase inhibitor omitted from lysis buffer ────────────
  {
    slug: "p4-phosphatase-inhibitor-omitted",
    date: "2023-01-16",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 25, transfer_time: 90 },
    notes: [
      "2023-01-16 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM on MOLM-14 (heterozygous FLT3-ITD), 2 h, intended as a repeat of the 2022-11-14 pharmacodynamic blot.",
      "Deviation: the phosphatase-inhibitor cocktail was omitted from the ice-cold RIPA lysis buffer (only protease inhibitor was added), so cellular phosphatases stayed active all through lysis.",
      "Result: phospho-signal is gone from EVERY lane — including the untreated DMSO positive-control lane that should read ~100% p-STAT5. Densitometry of the control lane is only ~3% of the historical baseline.",
      "Total STAT5 and β-actin are normal, proving protein was loaded and transferred correctly — the phospho-epitopes were stripped after lysis, not absent in the cells.",
      "Run void: with the positive control dead the quizartinib lane cannot be interpreted. Corrective action: always add fresh phosphatase inhibitor to the RIPA immediately before lysis; re-run scheduled.",
    ],
    measurement: { name: "p-STAT5 in untreated positive-control lane", value: 3, unit: "% of DMSO control" },
    deviation: {
      expected: "fresh phosphatase inhibitor in the RIPA lysis buffer",
      actual: "phosphatase inhibitor omitted from the lysis buffer",
      reason: "active phosphatases stripped the phospho-epitopes during lysis",
      severity: "critical",
    },
    verdict: "failure",
    reason: "phosphatase inhibitor omitted from lysis buffer → phospho-signal lost in all lanes",
  },

  // 5 ── FAILURE: protein overload (~50 µg/lane), smeared/unquantifiable ─────
  {
    slug: "p4-protein-overload-smeared",
    date: "2023-02-13",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 50, transfer_time: 90 },
    notes: [
      "2023-02-13 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM vs DMSO on MOLM-14 (heterozygous FLT3-ITD), 2 h phospho-blot, second attempt after the 2023-01-16 lysis-buffer failure.",
      "Deviation: the BCA protein quantification was mis-read and ~50 µg protein was loaded per lane instead of the 20–30 µg the protocol allows.",
      "Overloaded lanes smeared badly — the p-STAT5 and p-ERK1/2 bands are broad, fused into the background, and densitometry cannot resolve clean peaks.",
      "β-actin is likewise saturated and streaked, which confirms a gross overload rather than a transfer defect.",
      "Unquantifiable: no reliable p-STAT5 % can be extracted from this blot. Corrective action: re-quantify the lysates and re-load at 20–25 µg/lane.",
    ],
    deviation: {
      expected: "20–30 µg protein per lane",
      actual: "~50 µg protein loaded per lane",
      reason: "overloaded lanes smear and blur band quantification",
      severity: "major",
    },
    verdict: "failure",
    reason: "protein overload (~50 µg/lane) → smeared, unquantifiable bands",
  },

  // 6 ── FAILURE: over-transfer (~180 min), high-MW FLT3 band lost ──────────
  {
    slug: "p4-over-transfer-flt3-lost",
    date: "2023-03-13",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 25, transfer_time: 180 },
    notes: [
      "2023-03-13 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM vs DMSO on MOLM-14 (heterozygous FLT3-ITD), 2 h phospho-blot with the p-FLT3 / total FLT3 readout as the primary target.",
      "Deviation: the wet transfer ran ~180 min instead of the standard ~90 min (the tank was left on the long programme overnight).",
      "Over-transfer drove the high-molecular-weight FLT3 band (~150–160 kDa) straight through the PVDF and off the back of the membrane — p-FLT3 and total FLT3 are absent, while the smaller proteins are over-transferred and faint.",
      "The p-FLT3 pharmacodynamic comparison is therefore lost; β-actin (~42 kDa) is still detectable but weak, consistent with global over-transfer.",
      "Corrective action: cap the wet transfer at ~90 min (or run a tank-transfer time-course tuned for high-MW targets); re-run to recover the FLT3 band.",
    ],
    deviation: {
      expected: "wet transfer ~90 min",
      actual: "over-transfer ~180 min",
      reason: "excess transfer drove the high-MW FLT3 (~150–160 kDa) band through the membrane",
      severity: "major",
    },
    verdict: "failure",
    reason: "over-transfer (~180 min) → high-MW FLT3 band driven through the membrane and lost",
  },

  // 7 ── FAILURE: degraded/expired anti-p-STAT5 antibody (false negative) ────
  {
    slug: "p4-degraded-pstat5-antibody",
    date: "2023-04-17",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 25, transfer_time: 90 },
    notes: [
      "2023-04-17 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM vs untreated MOLM-14 (heterozygous FLT3-ITD), 2 h, re-probing p-STAT5 as the primary pharmacodynamic marker.",
      "Deviation: the anti-phospho-STAT5 primary antibody was past its expiry and had been left at 4 °C rather than aliquoted at −20 °C (out of spec) — effectively degraded.",
      "No p-STAT5 signal in any lane, including the untreated positive-control lane that should read ~100%. This mimics a true negative but is an antibody failure, not loss of signalling.",
      "Diagnostic: β-actin and total STAT5 (fresh antibody lots) are strong and even, and p-ERK1/2 develops normally — so protein, transfer and detection are all fine; the fault is isolated to the dead anti-p-STAT5 antibody.",
      "Corrective action: open a fresh, in-date, correctly aliquoted anti-p-STAT5 lot and re-probe; do NOT report this blot as a loss of p-STAT5.",
    ],
    measurement: { name: "p-STAT5 in untreated positive-control lane", value: 2, unit: "% of DMSO control" },
    deviation: {
      expected: "in-date, properly stored anti-phospho-STAT5 primary antibody",
      actual: "expired / degraded anti-p-STAT5 antibody (out of spec)",
      reason: "a degraded primary antibody gives no signal and mimics a true negative",
      severity: "major",
    },
    verdict: "failure",
    reason: "degraded/expired anti-p-STAT5 antibody → no signal (false negative)",
  },

  // 8 ── quizartinib dose-dependent p-STAT5 (0/1/5/10 nM), MOLM-14, 2 h ──────
  {
    slug: "p4-quizartinib-dose-dependent-pstat5",
    date: "2023-06-19",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 20, transfer_time: 90 },
    notes: [
      "2023-06-19 · operator Emmanuel Djezvedjian. Quizartinib (AC220) dose-dependent phospho-STAT5 on MOLM-14 (heterozygous FLT3-ITD): a four-lane titration at 0, 1, 5 and 10 nM, 2 h, DMSO held constant across lanes.",
      "20 µg protein/lane, fresh phosphatase inhibitor, 90 min transfer; densitometry normalised to the 0 nM (DMSO) lane = 100%.",
      "Graded loss of p-STAT5 with dose: 100% (0 nM) → ~70% (1 nM) → ~30% (5 nM) → ~6% (10 nM), tracking the low-nanomolar viability IC50 and giving a clean pharmacodynamic dose-response.",
      "p-ERK1/2 follows the same trend more shallowly; total STAT5 and β-actin are flat across the titration, confirming the effect is phospho-specific.",
      "Near-complete p-STAT5 shutdown pins at 10 nM, matching the single-dose 2022-11-14 blot (~5%) and the 2022-12-12 gilteritinib result.",
    ],
    measurement: { name: "p-STAT5 at 10 nM quizartinib (2 h)", value: 6, unit: "% of DMSO control" },
    verdict: "success",
  },

  // 9 ── quizartinib 10 nM, MV4-11, 2 h (homozygous-ITD replicate) ──────────
  {
    slug: "p4-quizartinib-mv411-replicate",
    date: "2023-09-18",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { drug_concentration: 10, treatment_time: 2, protein_load_ug: 20, transfer_time: 90 },
    notes: [
      "2023-09-18 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM on MV4-11 (homozygous FLT3-ITD), 2 h, DMSO-vehicle control — a cross-line replicate of the MOLM-14 pharmacodynamics (cf. the 2022-11-14 blot).",
      "20 µg protein/lane, fresh phosphatase inhibitor, 90 min PVDF transfer; p-STAT5 / p-AKT / p-ERK1/2 vs total protein and β-actin.",
      "Strong constitutive p-STAT5 at baseline (homozygous FLT3-ITD, no wild-type allele to dilute the signal) collapses to ~4% of DMSO control at 2 h — the deepest, fastest shutdown in the panel.",
      "Matches the MOLM-14 result and the most-FLT3-addicted phenotype of MV4-11 (lowest viability IC50, ~1 nM), confirming p-STAT5 as a portable on-target FLT3 readout across FLT3-ITD lines.",
    ],
    measurement: { name: "p-STAT5 at 10 nM quizartinib (2 h)", value: 4, unit: "% of DMSO control" },
    verdict: "success",
  },
];

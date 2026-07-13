// scripts/aml-runs-p3.ts — run-spec seed for P3 "Apoptosis by Annexin V-FITC / PI
// flow cytometry". Each run's free-text notes are what the AI reads to build the
// knowledge graph (cell lines, reagents, parameter values, failure modes). English
// only; notes[0] carries the historical date + operator for the KG date node.
// Param keys (numbers only): drug_concentration (nM), staining_time (min),
// cell_number (cells), incubation_time (h).
import type { RunSpec } from "./aml-common";

export const P3_RUNS: RunSpec[] = [
  // 1 ── quizartinib 10 nM / MOLM-14 / 48 h — apoptosis baseline (success)
  {
    slug: "quizartinib-molm14-apoptosis-48h",
    date: "2022-04-25",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-04-25 · operator Emmanuel Djezvedjian. Annexin V-FITC / PI apoptosis assay: quizartinib (AC220) 10 nM on MOLM-14 (heterozygous FLT3-ITD), 48 h exposure, paired DMSO vehicle control. First mechanistic follow-up to the P2 viability IC50 (~2 nM), so 10 nM sits ~5× above IC50.",
      "Treated 2 × 10^5 cells/sample in triplicate; harvested, washed and resuspended in Annexin V binding buffer (with Ca2+), stained 15 min in the dark with Annexin V-FITC + PI, acquired on the BD FACSCanto II within 30 min.",
      "Gating: Annexin V+ (early + late apoptotic, PI±). DMSO control sat at ~8% Annexin V+ (baseline death); the quizartinib arm rose to ~60%.",
      "Clean quadrant separation with the early-apoptotic (Annexin V+/PI−) fraction dominant — consistent with programmed cell death rather than necrosis.",
      "Result: 60% apoptosis vs 8% vehicle establishes the MOLM-14 apoptosis baseline this campaign reads against, complementing the CellTiter-Glo IC50 with a mechanism.",
    ],
    measurement: { name: "% apoptosis (Annexin V+)", value: 60, unit: "% apoptosis" },
    verdict: "success",
  },

  // 2 ── gilteritinib 30 nM / MOLM-14 / 48 h — apoptosis (success)
  {
    slug: "gilteritinib-molm14-apoptosis-48h",
    date: "2022-05-23",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 30, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-05-23 · operator Emmanuel Djezvedjian. Annexin V-FITC / PI apoptosis assay: gilteritinib (ASP2215) 30 nM on MOLM-14 (heterozygous FLT3-ITD), 48 h exposure, DMSO vehicle control. 30 nM is ~2× the P2 gilteritinib IC50 on MOLM-14 (~15 nM).",
      "2 × 10^5 cells/sample, triplicate; Annexin V binding buffer with Ca2+, 15 min stain in the dark, acquired within 40 min on the FACSCanto II.",
      "Vehicle ~7% Annexin V+; the gilteritinib arm reached ~52% apoptosis — slightly below the quizartinib 10 nM result of 2022-04-25 (60%), consistent with quizartinib being the more potent FLT3 inhibitor on this line.",
      "Early-apoptotic fraction predominant; mechanism mirrors quizartinib (on-target FLT3 blockade → programmed cell death).",
    ],
    measurement: { name: "% apoptosis (Annexin V+)", value: 52, unit: "% apoptosis" },
    verdict: "success",
  },

  // 3 ── quizartinib dose titration 1/5/10/50 nM / MOLM-14 / 48 h — dose-dependent (success)
  {
    slug: "quizartinib-molm14-apoptosis-titration",
    date: "2022-06-20",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 50, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-06-20 · operator Emmanuel Djezvedjian. Dose-titration apoptosis assay: quizartinib (AC220) on MOLM-14 (heterozygous FLT3-ITD) at 1 / 5 / 10 / 50 nM, 48 h exposure, DMSO vehicle control. Reports the concentration axis behind the single-point 60% seen on 2022-04-25.",
      "2 × 10^5 cells/sample per dose, triplicate; Annexin V binding buffer with Ca2+, 15 min stain, each acquired within 1 h on the FACSCanto II.",
      "Dose-dependent Annexin V+: ~12% at 1 nM, ~35% at 5 nM, ~58% at 10 nM, ~70% at 50 nM (vehicle ~8%). The 10 nM point reproduces the 2022-04-25 baseline (~60%).",
      "The monotonic dose-response confirms the apoptosis readout tracks FLT3 inhibition rather than a fixed-dose artefact; primary metric reported at the 50 nM top dose.",
      "Consistent with the low-nanomolar quizartinib potency on MOLM-14 (P2 IC50 ~2 nM); cf. IJMS 2018 (10.3390/ijms19103198).",
    ],
    measurement: { name: "% apoptosis at 50 nM (Annexin V+)", value: 70, unit: "% apoptosis" },
    verdict: "success",
  },

  // 4 ── quizartinib 10 nM / MOLM-14 — FAILURE: binding buffer without Ca2+ (⚠️ Ca2+ threshold)
  {
    slug: "quizartinib-molm14-apoptosis-no-calcium",
    date: "2022-07-18",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-07-18 · operator Emmanuel Djezvedjian. Repeat of the quizartinib (AC220) 10 nM / MOLM-14 / 48 h apoptosis assay (cf. 2022-04-25), intended to reconfirm the ~60% baseline.",
      "Cells were treated and stained normally: 2 × 10^5 cells/sample, Annexin V-FITC + PI, 15 min in the dark, acquired within 30 min.",
      "Deviation: the Annexin V binding buffer was made up WITHOUT calcium — a Ca2+-free stock was grabbed by mistake. Annexin V binding to phosphatidylserine is strictly Ca2+-dependent, so with no calcium the probe cannot bind.",
      "Result: both vehicle and quizartinib arms read a flat ~6% Annexin V+ — no apoptosis signal, indistinguishable from background, despite the ~60% expected in the drug arm. The PI channel looked normal, confirming the defect is specific to Annexin V binding.",
      "Root cause is the calcium-free buffer, not the biology. Corrective action: discard the Ca2+-free stock, use Annexin V binding buffer with Ca2+, and re-run.",
    ],
    measurement: { name: "% apoptosis (Annexin V+)", value: 6, unit: "% apoptosis" },
    deviation: {
      expected: "Annexin V binding buffer must contain Ca2+",
      actual: "binding buffer prepared without calcium",
      reason: "no Ca2+ → Annexin V cannot bind phosphatidylserine",
      severity: "critical",
    },
    verdict: "failure",
    reason: "binding buffer lacked Ca2+ (Annexin V cannot bind, no signal)",
  },

  // 5 ── quizartinib 10 nM / MOLM-14 — FAILURE: too few cells (⚠️ ≥1×10^5 threshold)
  {
    slug: "quizartinib-molm14-apoptosis-too-few-cells",
    date: "2022-08-22",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 40000, incubation_time: 48 },
    notes: [
      "2022-08-22 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM / MOLM-14 / 48 h apoptosis assay run from a sparse, poorly-growing stock.",
      "Deviation: only ~4 × 10^4 cells were stained per sample — below the protocol minimum of ≥ 1 × 10^5 cells/sample. Annexin V binding buffer (with Ca2+) and the 15 min stain were otherwise nominal.",
      "Too few events reached the apoptotic gate (~4,200 gated), so gating was noisy and the quadrant boundaries ambiguous; the Annexin V+ estimate swung to ~44% but with a ±20% spread across replicates.",
      "The number is not trustworthy — poor statistics from under-seeding, not a real change in apoptosis — and cannot be compared against the 2022-04-25 baseline (60%).",
      "Corrective action: expand the culture and re-seed at ≥ 2 × 10^5 cells/sample before re-running.",
    ],
    measurement: { name: "% apoptosis (Annexin V+, unreliable)", value: 44, unit: "% apoptosis" },
    deviation: {
      expected: "≥ 1 × 10^5 cells stained per sample",
      actual: "~4 × 10^4 cells stained per sample",
      reason: "too few events → noisy gating / poor statistics",
      severity: "major",
    },
    verdict: "failure",
    reason: "cell number below 1×10^5 minimum (noisy gating, unreliable)",
  },

  // 6 ── quizartinib 10 nM / MOLM-14 — FAILURE: delayed acquisition (⚠️ read within 1 h threshold)
  {
    slug: "quizartinib-molm14-apoptosis-delayed-read",
    date: "2022-09-19",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-09-19 · operator Emmanuel Djezvedjian. Quizartinib (AC220) 10 nM / MOLM-14 / 48 h apoptosis assay; staining nominal (2 × 10^5 cells, Annexin V binding buffer with Ca2+, 15 min in the dark).",
      "Deviation: the flow cytometer was occupied, so acquisition happened ~3 h after staining instead of within the 1 h read window.",
      "Over that delay PI leaked into live cells, inflating the PI+ and double-positive fractions; apparent Annexin V+ death rose to ~85% — well above the ~60% expected for this condition (cf. 2022-04-25).",
      "The excess is a read-window artefact (false-positive death), not extra biology. Even the vehicle control crept up to ~18% Annexin V+/PI+, confirming non-specific PI uptake.",
      "Corrective action: acquire within 1 h of staining (keep samples on ice, in the dark) or restain a fresh aliquot; re-run to confirm the true ~60%.",
    ],
    measurement: { name: "% apoptosis (Annexin V+, inflated)", value: 85, unit: "% apoptosis" },
    deviation: {
      expected: "acquire within 1 h of staining",
      actual: "acquired ~3 h after staining",
      reason: "PI leaks into live cells → false-positive death inflated",
      severity: "major",
    },
    verdict: "failure",
    reason: "acquisition delayed beyond 1 h (PI leakage inflates apparent death)",
  },

  // 7 ── quizartinib 10 nM / MV4-11 / 48 h — apoptosis, more sensitive line (success)
  {
    slug: "quizartinib-mv411-apoptosis-48h",
    date: "2022-10-24",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 200000, incubation_time: 48 },
    notes: [
      "2022-10-24 · operator Emmanuel Djezvedjian. Annexin V-FITC / PI apoptosis assay: quizartinib (AC220) 10 nM on MV4-11 (homozygous FLT3-ITD), 48 h, with a paired DMSO vehicle control. Cross-line comparison against the MOLM-14 baseline (2022-04-25, 60%).",
      "2 × 10^5 cells/sample, triplicate; Annexin V binding buffer with Ca2+, 15 min stain, acquired within 45 min on the FACSCanto II.",
      "DMSO control ~9% Annexin V+; the quizartinib arm reached ~68% apoptosis — higher than MOLM-14 at the same 10 nM dose.",
      "Consistent with MV4-11 being homozygous FLT3-ITD and the most FLT3-addicted line (lowest quizartinib IC50, ~1 nM in P2), so it is more readily driven into apoptosis.",
      "Predominantly early-apoptotic (Annexin V+/PI−) — on-target programmed cell death; cf. Sci Rep 2021 (10.1038/s41598-021-02221-2).",
    ],
    measurement: { name: "% apoptosis (Annexin V+)", value: 68, unit: "% apoptosis" },
    verdict: "success",
  },

  // 8 ── quizartinib 10 nM / MOLM-14 — time-course 24/48/72 h (partial: 24 h under-reads)
  {
    slug: "quizartinib-molm14-apoptosis-timecourse",
    date: "2022-11-21",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 10, staining_time: 15, cell_number: 200000, incubation_time: 72 },
    notes: [
      "2022-11-21 · operator Emmanuel Djezvedjian. Apoptosis time-course: quizartinib (AC220) 10 nM on MOLM-14 (heterozygous FLT3-ITD), Annexin V-FITC / PI read at 24 / 48 / 72 h, with a DMSO vehicle control at each timepoint.",
      "2 × 10^5 cells/sample per timepoint, Annexin V binding buffer with Ca2+, 15 min stain, each acquired within 1 h.",
      "Kinetics: ~30% Annexin V+ at 24 h, ~60% at 48 h, ~72% at 72 h (vehicle 8–10% throughout). The 48 h point reproduces the 2022-04-25 baseline.",
      "Methodological caveat: the 24 h timepoint under-reads apoptosis — the response has not plateaued — so a single early endpoint would understate the drug effect. This is a kinetics caveat, not a clean single endpoint.",
      "Read as a curve the result is coherent (monotonic rise to 72 h); flagged partial because the 24 h endpoint on its own is misleading. Recommend reporting apoptosis at ≥ 48 h.",
    ],
    measurement: { name: "% apoptosis at 72 h (Annexin V+)", value: 72, unit: "% apoptosis" },
    deviation: {
      expected: "read a settled apoptotic endpoint (≥ 48 h exposure)",
      actual: "24 h timepoint under-reads apoptosis (~30% vs ~60% at 48 h)",
      reason: "apoptosis kinetics not yet plateaued at 24 h",
      severity: "minor",
    },
    verdict: "partial",
    reason: "24 h endpoint under-reads apoptosis (kinetics not plateaued)",
  },
];

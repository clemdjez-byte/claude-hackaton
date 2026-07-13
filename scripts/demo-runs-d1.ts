// scripts/demo-runs-d1.ts — Protocol D1 demo run-specs.
// D1 = "TKI drug-synergy assay (quizartinib + venetoclax, Bliss)".
// Each RunSpec drives the real pipeline (run → evidence → signed report →
// verdict → RAG + KG). Entities are spelled identically to the P1–P6 seed so
// the knowledge graph hubs (MOLM-14, MV4-11, THP-1, MOLM-14-QuizR, quizartinib
// (AC220), venetoclax (ABT-199), FLT3-ITD, D835Y). Primary metric = peak Bliss
// synergy score (or CV for the excluded plate). All English.
import type { RunSpec } from "./aml-common";

export const D1_RUNS: RunSpec[] = [
  // 1 ── MOLM-14 6×6 matrix — strong synergy ────────────────────────────────
  {
    slug: "quizartinib-venetoclax-synergy-molm14",
    date: "2024-01-15",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-01-15 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 checkerboard on MOLM-14 (heterozygous FLT3-ITD), 72 h, DMSO held isovolumetric at 0.1%, PBS edge ring.",
      "Single-agent ranges: quizartinib 0.1–100 nM, venetoclax 1–1000 nM; DMSO-vehicle and blank wells included, inner wells only.",
      "CellTiter-Glo read, normalized to DMSO = 100%; observed combined killing sits well above the Bliss-independence expectation across the mid-dose block.",
      "Peak Bliss synergy score ~0.25 (strong synergy) around quizartinib 3 nM + venetoclax 100 nM — consistent with FLT3-ITD propping up BCL-2/MCL-1.",
      "Combination kills below either single-agent IC50 and anchors the synergy matrix against the naïve quizartinib IC50 baseline (~2 nM on MOLM-14).",
    ],
    measurement: { name: "Peak Bliss synergy score", value: 0.25, unit: "score" },
    result: {
      note: "Strong quizartinib+venetoclax synergy in MOLM-14 (peak Bliss ~0.25 at 3 nM + 100 nM); the combination kills below either single-agent IC50.",
      measurement: { name: "Peak Bliss synergy score", value: 0.25, unit: "score" },
    },
    verdict: "success",
  },

  // 2 ── MV4-11 matrix — strongest synergy (most FLT3-addicted) ──────────────
  {
    slug: "quizartinib-venetoclax-synergy-mv411",
    date: "2024-02-19",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-02-19 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 checkerboard on MV4-11 (homozygous FLT3-ITD, the most FLT3-addicted line), 72 h, DMSO 0.1%, PBS edge ring.",
      "Single-agent ranges: quizartinib 0.1–100 nM (MV4-11 naïve IC50 ~1 nM), venetoclax 1–1000 nM; DMSO-vehicle and blank wells included.",
      "CellTiter-Glo read, normalized to DMSO = 100%; the combined-killing surface sits well above Bliss independence across a broad low-dose block.",
      "Peak Bliss synergy score ~0.30 — stronger than MOLM-14, as expected for the homozygous FLT3-ITD line most dependent on FLT3 → BCL-2/MCL-1 survival signalling.",
      "Reinforces the on-target synergy model; single-agent potencies match the baseline (quizartinib ~1 nM on MV4-11 vs ~2 nM on MOLM-14).",
    ],
    measurement: { name: "Peak Bliss synergy score", value: 0.3, unit: "score" },
    result: {
      note: "Strongest synergy in the panel on MV4-11 (peak Bliss ~0.30), consistent with the most FLT3-addicted line being most dependent on FLT3-driven BCL-2/MCL-1.",
      measurement: { name: "Peak Bliss synergy score", value: 0.3, unit: "score" },
    },
    verdict: "success",
  },

  // 3 ── THP-1 (FLT3-WT) control — no synergy (on-target specificity) ────────
  {
    slug: "quizartinib-venetoclax-control-thp1",
    date: "2024-03-18",
    cellLine: "THP-1 (FLT3 wild-type)",
    params: { drug_concentration: 10000, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-03-18 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 checkerboard on THP-1 (FLT3 wild-type) as the on-target specificity control, 72 h, DMSO 0.1%, PBS edge ring.",
      "Quizartinib range extended to 10 000 nM (THP-1 is spared by FLT3 inhibition until micromolar); venetoclax 1–1000 nM; DMSO-vehicle and blank wells included.",
      "CellTiter-Glo read, normalized to DMSO = 100%; the response surface tracks Bliss independence — additive at best, with no synergistic block.",
      "Peak Bliss synergy score ~0.02 (no meaningful synergy) — because THP-1 lacks FLT3-ITD, quizartinib does not collapse the BCL-2/MCL-1 buffer, so venetoclax gains nothing.",
      "Confirms the quizartinib+venetoclax synergy seen in MOLM-14/MV4-11 is on-target FLT3-ITD biology, not a generic combination effect.",
    ],
    measurement: { name: "Peak Bliss synergy score", value: 0.02, unit: "score" },
    result: {
      note: "No meaningful synergy in FLT3-WT THP-1 (peak Bliss ~0.02, additive at best) — confirms on-target specificity: the quizartinib+venetoclax effect requires FLT3-ITD.",
      measurement: { name: "Peak Bliss synergy score", value: 0.02, unit: "score" },
    },
    verdict: "success",
  },

  // 4 ── DMSO scaled with dose (>0.1%) — FAILURE, Results LEFT EMPTY ─────────
  {
    slug: "synergy-dmso-vehicle-confound-molm14",
    date: "2024-04-22",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.3, cell_density: 50000 },
    notes: [
      "2024-04-22 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) matrix on MOLM-14 (heterozygous FLT3-ITD) invalidated by a vehicle confound — DMSO was allowed to scale with quizartinib dose instead of being held isovolumetric.",
      "Top-dose wells reached ~0.3% final DMSO (threshold is ≤0.1%); above 0.1% the vehicle is independently cytotoxic and is killing cells on its own.",
      "The extra killing in the high-quizartinib block cannot be separated from DMSO toxicity, so the Bliss surface is confounded and uninterpretable.",
      "Corrective action: back-fill DMSO to a constant 0.1% in every well (isovolumetric), re-stamp the drug plate, and re-run.",
      "Plate excluded from the synergy dataset — no synergy call issued.",
    ],
    measurement: { name: "Final DMSO in top-dose wells", value: 0.3, unit: "%" },
    deviation: {
      expected: "final DMSO held isovolumetric at ≤0.1% across the matrix",
      actual: "DMSO scaled with quizartinib dose, ~0.3% in top-dose wells",
      reason: "vehicle cytotoxicity above 0.1% confounds the drug effect",
      severity: "major",
    },
    // result intentionally left undefined — demo the empty "Results" state.
    verdict: "failure",
    reason: "DMSO vehicle confound (>0.1% in top-dose wells) — matrix uninterpretable, plate excluded",
  },

  // 5 ── Edge-well evaporation, plate excluded — FAILURE, Results LEFT EMPTY ─
  {
    slug: "synergy-edge-well-evaporation-molm14",
    date: "2024-05-20",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-05-20 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) matrix on MOLM-14 (heterozygous FLT3-ITD) ruined by edge-well evaporation — the PBS edge ring was omitted and outer wells were used for data.",
      "Outer wells lost volume over 72 h (CV ~40% vs <10% for inner wells), concentrating drug and cells and inflating the apparent killing at the plate margin.",
      "The response surface was unusable and the plate was excluded from the synergy dataset.",
      "Corrective action: fill the edge ring with PBS, restrict data to inner wells, and re-run.",
    ],
    measurement: { name: "Outer-well CV", value: 40, unit: "%" },
    deviation: {
      expected: "PBS edge ring; inner wells only",
      actual: "samples in outer wells, no PBS moat",
      reason: "edge-well evaporation over 72 h",
      severity: "major",
    },
    // result intentionally left undefined — demo the empty "Results" state.
    verdict: "failure",
    reason: "edge-well evaporation — outer-well CV ~40%, plate excluded (no result)",
  },

  // 6 ── Single-agent baseline re-run — anchors the matrix ───────────────────
  {
    slug: "single-agent-baseline-reanchor-molm14",
    date: "2024-06-17",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-06-17 · operator Emmanuel Djezvedjian. Single-agent baseline re-run on MOLM-14 (heterozygous FLT3-ITD): quizartinib (AC220) and venetoclax (ABT-199) dose-responses run separately, 72 h, DMSO 0.1%, to re-anchor the synergy matrix.",
      "Quizartinib 0.1–100 nM and venetoclax 1–1000 nM, CellTiter-Glo, normalized to DMSO = 100%, 4-parameter logistic fit.",
      "Quizartinib single-agent IC50 ~2 nM — matches the naïve baseline; venetoclax single-agent IC50 confirmed in the expected range.",
      "These single-agent curves are the reference lines the Bliss-independence model is built from — without a clean baseline the computed synergy scores drift.",
      "Baseline accepted; the matrix runs (2024-01-15 MOLM-14, 2024-02-19 MV4-11) are anchored to it.",
    ],
    measurement: { name: "Quizartinib single-agent IC50", value: 2, unit: "nM" },
    result: {
      note: "Clean single-agent baseline: quizartinib IC50 ~2 nM (matches the naïve baseline) and venetoclax IC50 confirmed — the reference curves that anchor every Bliss synergy score.",
      measurement: { name: "Quizartinib single-agent IC50", value: 2, unit: "nM" },
    },
    verdict: "success",
  },

  // 7 ── 48 h vs 72 h readout — partial (read too early) ─────────────────────
  {
    slug: "synergy-readout-48h-vs-72h-molm14",
    date: "2024-08-19",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 48, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-08-19 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 matrix on MOLM-14 (heterozygous FLT3-ITD) read at 48 h instead of the 72 h standard, to test readout timing.",
      "Same 6×6 design, DMSO 0.1%, PBS edge ring; CellTiter-Glo read at 48 h.",
      "Peak Bliss synergy score at 48 h ~0.12 — roughly half the 72 h value (~0.25) on the same line, because combination-driven apoptosis is still developing at 48 h.",
      "The synergy is under-read, not absent: 48 h captures the trend but not the full effect, so the run is only partially informative.",
      "Deviation: read too early relative to the 72 h standard; corrective action is to hold every synergy plate to 72 h before scoring.",
    ],
    measurement: { name: "Peak Bliss synergy score (48 h)", value: 0.12, unit: "score" },
    deviation: {
      expected: "72 h readout (standard) before scoring synergy",
      actual: "matrix read at 48 h",
      reason: "48 h under-reads the still-developing combination apoptosis",
      severity: "minor",
    },
    result: {
      note: "48 h under-reads synergy: peak Bliss ~0.12 vs ~0.25 at 72 h on the same line — the effect is real but the plate was scored too early.",
      measurement: { name: "Peak Bliss synergy score (48 h)", value: 0.12, unit: "score" },
    },
    verdict: "partial",
    reason: "read too early (48 h vs 72 h) — synergy under-read (~0.12 vs ~0.25 at 72 h)",
  },

  // 8 ── MOLM-14-QuizR combo — re-sensitizes the resistant subline ───────────
  {
    slug: "quizartinib-venetoclax-resensitize-molm14-quizr",
    date: "2024-10-21",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant subline, D835Y)",
    params: { drug_concentration: 1000, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-10-21 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 checkerboard on MOLM-14-QuizR (quizartinib-resistant subline carrying the D835Y TKD mutation), 72 h, DMSO 0.1%, PBS edge ring.",
      "Quizartinib extended to 1000 nM (the subline's single-agent IC50 is right-shifted ~50× vs the ~2 nM naïve MOLM-14 baseline); venetoclax 1–1000 nM.",
      "Single-agent quizartinib barely dents MOLM-14-QuizR, but the combination surface sits well above Bliss independence.",
      "Peak Bliss synergy score ~0.28 — adding venetoclax re-sensitizes the resistant subline: synergy restores killing despite single-agent quizartinib resistance.",
      "Mechanistically consistent — even with D835Y blunting quizartinib potency, residual FLT3 signalling still props up BCL-2/MCL-1, so venetoclax co-treatment reopens apoptosis; the project's cross-resistance payoff.",
    ],
    measurement: { name: "Peak Bliss synergy score", value: 0.28, unit: "score" },
    result: {
      note: "Combination re-sensitizes the quizartinib-resistant MOLM-14-QuizR (D835Y): peak Bliss ~0.28 restores killing even though single-agent quizartinib is inactive.",
      measurement: { name: "Peak Bliss synergy score", value: 0.28, unit: "score" },
    },
    verdict: "success",
  },

  // 9 ── Synergy threshold mis-set (over-called) — partial ───────────────────
  {
    slug: "synergy-cutoff-not-prespecified-molm14",
    date: "2024-12-16",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2024-12-16 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 matrix on MOLM-14 (heterozygous FLT3-ITD), 72 h, DMSO 0.1%; scoring flagged for a mis-set synergy threshold.",
      "The synergy cutoff was not fixed a priori — it was chosen post hoc after inspecting the response surface, and set low enough to call a marginal block synergistic.",
      "Reported peak Bliss ~0.15 was labelled synergy, but re-scoring with a pre-specified cutoff and proper replicate variance places it in the additive range.",
      "Over-called synergy: the effect is weak and within noise of additivity, so the synergy claim is not supported at the pre-registered threshold.",
      "Deviation: cutoff not fixed a priori (analytical flexibility); corrective action is to pre-specify the Bliss cutoff and replicate count before unblinding the surface.",
    ],
    measurement: { name: "Peak Bliss synergy score (post-hoc cutoff)", value: 0.15, unit: "score" },
    deviation: {
      expected: "synergy cutoff fixed a priori (pre-specified Bliss threshold + replicate variance)",
      actual: "cutoff chosen post hoc after inspecting the response surface",
      reason: "post-hoc cutoff over-calls marginal effects as synergy",
      severity: "minor",
    },
    result: {
      note: "Synergy over-called: reported peak Bliss ~0.15 was flagged synergistic under a post-hoc cutoff, but is additive at the pre-specified a priori threshold.",
      measurement: { name: "Peak Bliss synergy score (post-hoc cutoff)", value: 0.15, unit: "score" },
    },
    verdict: "partial",
    reason: "synergy cutoff not fixed a priori — synergy over-called; additive at the pre-specified threshold",
  },

  // 10 ── Misaligned matrix / offset dilutions — FAILURE (with result note) ──
  {
    slug: "synergy-misaligned-matrix-molm14",
    date: "2025-03-24",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { drug_concentration: 100, venetoclax_concentration: 1000, incubation_time: 72, dmso_pct: 0.1, cell_density: 50000 },
    notes: [
      "2025-03-24 · operator Emmanuel Djezvedjian. Quizartinib (AC220) × venetoclax (ABT-199) 6×6 matrix on MOLM-14 (heterozygous FLT3-ITD) invalidated by a misaligned drug map — the quizartinib serial dilution was offset by one column relative to venetoclax.",
      "Every well therefore received the wrong quizartinib/venetoclax pair, so the checkerboard no longer maps to the intended concentration grid.",
      "The Bliss response surface is corrupted — the apparent 'synergy' is an artifact of misassigned doses, not a real interaction, and no valid peak Bliss can be computed.",
      "Deviation: matrix alignment failed; corrective action is to verify the drug-map coordinates against the plate layout before dispensing, then re-run.",
      "Plate discarded from the synergy dataset.",
    ],
    measurement: { name: "Matrix dilution offset", value: 1, unit: "column" },
    deviation: {
      expected: "quizartinib and venetoclax serial dilutions aligned to the same well grid (verified drug map)",
      actual: "quizartinib dilution series offset by one column relative to venetoclax",
      reason: "misaligned matrix corrupts the Bliss response surface",
      severity: "critical",
    },
    result: {
      note: "Response surface corrupted by a one-column offset between the quizartinib and venetoclax dilution series; the apparent synergy is a dose-misassignment artifact and the plate was discarded — re-run required with a verified drug map.",
      measurement: { name: "Matrix dilution offset", value: 1, unit: "column" },
    },
    verdict: "failure",
    reason: "misaligned matrix (one-column offset) — response surface corrupted, plate discarded",
  },
];

// scripts/fluo-runs-f6.ts — run-specs for protocol F6 "Controls, artifacts & assay validation".
// Param keys (numbers only): depolarizer_conc (µM), wash_count (washes), permeabilization_time (min).
// These runs validate F1–F5: autofluorescence baseline, ΔΨm-vs-mass caveat, photobleaching limit,
// FCCP potential-dependence panel, and the final tied-together validated workflow.
import type { RunSpec } from "./aml-common";

export const F6_RUNS: RunSpec[] = [
  // 1 ── autofluorescence baseline (unstained + fixed) — success
  {
    slug: "autofluorescence-baseline-unstained-fixed-hela",
    date: "2025-05-20",
    cellLine: "HeLa",
    params: { depolarizer_conc: 0, wash_count: 3, permeabilization_time: 0 },
    notes: [
      "2025-05-20 · operator Emmanuel Djezvedjian. Autofluorescence baseline on HeLa: unstained samples imaged both live and after 4% PFA fixation (12 min, 3× PBS wash) with the exact confocal settings used for staining (Zeiss LSM 900), with no MitoTracker Deep Red FM / MitoTracker Red CMXRos / Hoechst 33342 added.",
      "Purpose: map the endogenous background so every stained readout can be background-subtracted; an assay without this baseline can mistake autofluorescence for genuine signal.",
      "Live unstained cells gave very low background across the blue/red/far-red channels; fixation raised the green/blue autofluorescence modestly but it stayed well below staining levels — mean background ~1.8 a.u. in the green channel versus stained MFI in the tens.",
      "Freshly prepared 4% PFA kept autofluorescence low, confirming the F4 fixation window (10–15 min, fresh PFA) does not over-fix; over-fixation would have raised background and could masquerade as signal.",
      "Stored as the reference background map for the potential-dependence panel (2026-02-17) and the full validation summary (2026-06-16).",
    ],
    measurement: { name: "Autofluorescence background (green channel)", value: 1.8, unit: "a.u." },
    verdict: "success",
  },

  // 2 ── MitoTracker Deep Red FM mis-used as a mitochondrial-mass marker — failure
  {
    slug: "deepred-misread-as-mass-marker-hela",
    date: "2025-09-16",
    cellLine: "HeLa",
    params: { depolarizer_conc: 20, wash_count: 3, permeabilization_time: 0 },
    notes: [
      "2025-09-16 · operator Emmanuel Djezvedjian. MitoTracker Deep Red FM 200 nM on HeLa (fixable far-red probe), used — incorrectly — as a quantitative mitochondrial-mass readout to compare a treated versus an untreated arm.",
      "The treated arm showed ~40% lower Deep Red MFI and was initially reported as 'reduced mitochondrial mass'.",
      "Deviation: MitoTracker Deep Red FM is ΔΨm-dependent, NOT a pure mass marker (cf. Xiao 2016, 10.3389/fncel.2016.00076). A drop in Deep Red signal can reflect a loss of membrane potential rather than fewer or smaller mitochondria.",
      "A retrospective FCCP control (20 µM, 45 min) collapsed the Deep Red signal by ~60% in the untreated arm as well — proving the readout is potential-dependent and that the 'mass' interpretation was an artifact of depolarization.",
      "Correct design: pair Deep Red with a true mass marker (e.g. live MitoTracker Green FM, following the F1 dye-selection logic) or normalize to a potential-independent stain before making any mass claim.",
      "Flagged for the potential-dependence panel (2026-02-17), which formalizes the FCCP ± dye control that this run skipped up front.",
    ],
    measurement: { name: "Deep Red signal drop with FCCP", value: 60, unit: "%" },
    deviation: {
      expected: "treat Deep Red as a ΔΨm-dependent probe and validate with FCCP (or use a true mass marker)",
      actual: "read a ΔΨm-dependent Deep Red MFI drop as a decrease in mitochondrial mass",
      reason: "misinterpreting a ΔΨm-dependent dye as a mass marker",
      severity: "major",
    },
    verdict: "failure",
    reason: "misread a ΔΨm-dependent dye (Deep Red) as a mitochondrial-mass marker",
  },

  // 3 ── photobleaching decay curve quantified — partial
  {
    slug: "photobleaching-decay-curve-hela",
    date: "2025-11-18",
    cellLine: "HeLa",
    params: { depolarizer_conc: 0, wash_count: 3, permeabilization_time: 0 },
    notes: [
      "2025-11-18 · operator Emmanuel Djezvedjian. Photobleaching characterization on HeLa stained with MitoTracker Red CMXRos (150 nM), fixed in 4% PFA + 0.1% glutaraldehyde (GA), then imaged as a continuous timelapse on the Zeiss LSM 900 to quantify signal decay.",
      "No anti-fade mountant and a deliberately high laser power were used, on purpose, to measure the worst-case decay curve under imaging conditions.",
      "The CMXRos signal decayed exponentially with a bleaching half-life of ~45 s — fast enough that a long z-stack would lose most of the signal before completing.",
      "Deviation: acquiring without adequate anti-fade / illumination limit bleaches the signal during acquisition (cf. the F5 photobleaching lesson). This run documents the limit rather than delivering a clean image, hence partial.",
      "Recommended acquisition envelope from the curve: ProLong Glass anti-fade plus the lowest laser power that preserves SNR, acquire the bleach-sensitive far-red/red channels last, and keep total exposure per field under ~one half-life.",
      "Feeds the acquisition limits into the full validation summary (2026-06-16).",
    ],
    measurement: { name: "Photobleaching half-life", value: 45, unit: "s" },
    deviation: {
      expected: "anti-fade mountant + restrained laser power/exposure (bleaching half-life kept well above acquisition time)",
      actual: "no anti-fade and high laser power — CMXRos half-life ~45 s",
      reason: "photobleaching without adequate anti-fade / illumination limit",
      severity: "minor",
    },
    verdict: "partial",
    reason: "photobleaching without adequate anti-fade / illumination limit",
  },

  // 4 ── potential-dependence validation panel (FCCP ± dyes) — success
  {
    slug: "potential-dependence-panel-fccp-hela",
    date: "2026-02-17",
    cellLine: "HeLa",
    params: { depolarizer_conc: 25, wash_count: 3, permeabilization_time: 0 },
    notes: [
      "2026-02-17 · operator Emmanuel Djezvedjian. Potential-dependence validation panel on HeLa: MitoTracker Red CMXRos (150 nM), MitoTracker Deep Red FM (200 nM) and TMRE (50 nM) each imaged ± FCCP (25 µM, 45 min) on the Zeiss LSM 900, background-subtracted against the 2025-05-20 autofluorescence baseline.",
      "For every dye the FCCP arm collapsed the mitochondrial signal, confirming all three readouts are membrane-potential-dependent.",
      "Signal drop with FCCP: CMXRos ~78%, Deep Red ~82%, TMRE ~90% — headline metric ~82% mean collapse.",
      "This is exactly the control the 2025-09-16 Deep Red run skipped: it formally proves CMXRos and Deep Red are ΔΨm probes, not mitochondrial-mass markers, and validates TMRE the same way (cf. the F3 FCCP/CCCP depolarization control).",
      "3× PBS washes and identical acquisition settings were used across the ± FCCP arms, with loading order kept constant (pre-load dye, then FCCP), so the comparison is clean.",
      "Panel accepted as the reference potential-dependence control for the full validation summary (2026-06-16).",
    ],
    measurement: { name: "Mean signal drop with FCCP", value: 82, unit: "%" },
    verdict: "success",
  },

  // 5 ── full assay validation summary — success
  {
    slug: "full-assay-validation-summary-hela",
    date: "2026-06-16",
    cellLine: "HeLa",
    params: { depolarizer_conc: 20, wash_count: 3, permeabilization_time: 10 },
    notes: [
      "2026-06-16 · operator Emmanuel Djezvedjian. Full assay-validation summary on HeLa, tying the F1–F5 fluorescent-labeling protocols into one validated workflow with its control set (MitoTracker Deep Red FM / MitoTracker Red CMXRos / TMRE / Hoechst 33342, FCCP, PFA + glutaraldehyde (GA), Triton X-100).",
      "Five controls pass end-to-end: (1) autofluorescence baseline (2025-05-20), (2) potential-dependence panel FCCP ± dyes (2026-02-17), (3) the ≥ 3× PBS wash policy, (4) the photobleaching envelope derived from the ~45 s CMXRos half-life (2025-11-18), and (5) fixation signal retention.",
      "Dye-to-endpoint rule carried from F1: live endpoints use MitoTracker Green FM (live-only), fixed endpoints use fixable ΔΨm dyes (CMXRos/Deep Red) — and those are always read as potential probes, never as mass markers (the 2025-09-16 error, cf. Xiao 2016).",
      "Fixation follows F4: 4% PFA + 0.1% glutaraldehyde (GA) retains the ΔΨm-dye signal that PFA-only loses (Qin 2021); for internal targets, permeabilize with Triton X-100 ~10 min after fixation, then wash 3× PBS.",
      "Multiplex acquisition follows F5: spectral compensation/unmixing for Hoechst→green and CMXRos→far-red bleed-through, plus anti-fade and restrained laser power inside the photobleaching envelope; the FCCP depolarization control (20 µM) from F3 validates every ΔΨm claim.",
      "Outcome: a reproducible, control-anchored labeling-plus-imaging workflow — 5/5 validation controls passing — signed off as the lab reference.",
    ],
    measurement: { name: "Validation controls passing", value: 5, unit: "controls" },
    verdict: "success",
  },
];

// scripts/fluo-runs-f5.ts — run inventory for Protocol F5
// "Multiplex staining + confocal imaging workflow (CMXRos + Hoechst + fixation)".
// Each RunSpec becomes a started run → signed English report → RAG + KG. Param
// keys (numbers only): mitotracker_conc (nM), hoechst_conc (nM),
// staining_incubation_time (min), pfa_exposure_time (min), imaging_exposure (ms).
// Metric = signal-to-background or photobleaching % as appropriate.
import type { RunSpec } from "./aml-common";

export const F5_RUNS: RunSpec[] = [
  // 1 ── 2024-10-29 · CMXRos 150 nM + Hoechst 1600 nM + 4% PFA (10 min) · success · two-color baseline
  {
    slug: "multiplex-cmxros-hoechst-baseline-hela",
    date: "2024-10-29",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, hoechst_conc: 1600, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 2 },
    notes: [
      "2024-10-29 · operator Emmanuel Djezvedjian. Two-color multiplex baseline on HeLa: MitoTracker Red CMXRos 150 nM (30 min at 37 °C) then Hoechst 33342 1600 nM (10 min), washed 3× PBS, fixed in 4% PFA for 10 min, washed again 3× PBS and imaged on the Zeiss LSM 900 confocal.",
      "CMXRos is a fixable, ΔΨm-dependent probe, so unlike MitoTracker Green FM it survives PFA fixation — the reason it was chosen over Green FM for this fixed-endpoint workflow (cf. the F1 dye-selection work).",
      "Clean two-color result: a filamentous red mitochondrial network over crisp blue nuclei, well-separated channels, signal-to-background ~12 with no obvious bleed-through at these settings.",
      "The low 2 ms dwell and modest laser kept photobleaching negligible on a single plane; this run is the reference the anti-fade and z-stack experiments build on (cf. 2024-12-10, 2025-01-21).",
      "No deviations — wash count (3× PBS) and PFA time (10 min) both within spec. Released as the two-color baseline for the multiplex optimization.",
    ],
    measurement: { name: "Signal-to-background", value: 12, unit: "a.u." },
    verdict: "success",
  },

  // 2 ── 2024-12-10 · add anti-fade mountant · success · bleaching 8% vs 35%
  {
    slug: "multiplex-antifade-mountant-hela",
    date: "2024-12-10",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, hoechst_conc: 1600, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 2 },
    notes: [
      "2024-12-10 · operator Emmanuel Djezvedjian. Repeat of the MitoTracker Red CMXRos 150 nM + Hoechst 33342 1600 nM two-color stain on HeLa (4% PFA, 10 min), this time mounted in ProLong Glass anti-fade mountant before confocal z-stack acquisition.",
      "Direct anti-fade comparison against the 2024-10-29 baseline: over a 20-plane z-stack the CMXRos signal loss fell from ~35% (no mountant) to ~8% with anti-fade — a large reduction in photobleaching at identical 2 ms dwell and laser power.",
      "Nuclei (Hoechst 33342) were essentially bleach-stable throughout; the win is on the red mitochondrial channel, which is the more bleach-sensitive of the two.",
      "Anti-fade mountant adopted as standard for all subsequent multiplex z-stacks; note it does not fix the separate problem of excessive laser/exposure (see the 2025-01-21 photobleaching failure).",
      "No deviations. Signal-to-background preserved across the stack; released as the anti-fade-protected reference.",
    ],
    measurement: { name: "Photobleaching (z-stack)", value: 8, unit: "%" },
    verdict: "success",
  },

  // 3 ── 2025-01-21 · high laser / long exposure (20 ms) · failure · photobleaching across z-stack
  {
    slug: "multiplex-overexposure-photobleaching-hela",
    date: "2025-01-21",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, hoechst_conc: 1600, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 20 },
    notes: [
      "2025-01-21 · operator Emmanuel Djezvedjian. Two-color MitoTracker Red CMXRos 150 nM + Hoechst 33342 1600 nM multiplex on HeLa (4% PFA, 10 min), deliberately acquired at high laser power and a long 20 ms dwell to push acquisition speed on a deep z-stack.",
      "Signal bleached severely across the stack: ~62% loss of CMXRos signal between the first and last planes, versus ~8% under anti-fade at 2 ms (cf. 2024-12-10) — the mitochondrial network faded to near-background by the deepest planes.",
      "This is a classic photobleaching failure from over-illumination: high laser × long 20 ms exposure × many planes deposits far more energy than the fluorophore tolerates, and no anti-fade can rescue a 10× over-exposure.",
      "Deviation logged against the F5 photobleaching threshold: exposure should be the lowest that gives adequate SNR (~2 ms here), not 20 ms, and bleach-sensitive channels should be acquired last.",
      "Corrective action: revert to low-power / short-dwell acquisition with anti-fade for the optimized protocol (2025-04-22).",
    ],
    measurement: { name: "Photobleaching (z-stack)", value: 62, unit: "%" },
    deviation: {
      expected: "lowest laser power and short dwell (~2 ms) that still gives adequate SNR, with anti-fade",
      actual: "high laser power and a long 20 ms dwell across a deep z-stack",
      reason: "excess illumination energy photobleaches the fluorophore",
      severity: "major",
    },
    verdict: "failure",
    reason: "photobleaching across the z-stack from high laser power and long (20 ms) exposure",
  },

  // 4 ── 2025-02-18 · insufficient wash (1× instead of 3×) · failure · high background
  {
    slug: "multiplex-under-wash-high-background-hela",
    date: "2025-02-18",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, hoechst_conc: 1600, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 2 },
    notes: [
      "2025-02-18 · operator Emmanuel Djezvedjian. MitoTracker Red CMXRos 150 nM + Hoechst 33342 1600 nM two-color stain on HeLa (4% PFA, 10 min), but with only a single PBS rinse after staining instead of the specified 3× PBS washes.",
      "High diffuse background in both channels: unbound CMXRos and free Hoechst 33342 left in the dish gave a hazy cytoplasmic/extracellular glow, dropping signal-to-background to ~2.4 versus ~12 for the properly washed baseline (2024-10-29).",
      "The mitochondrial network and nuclei were still present but poorly resolved against the residual-dye background — the run is uninterpretable for quantitative signal-to-background.",
      "Deviation logged against the F5 wash threshold: multiplex staining requires ≥ 3× PBS washes to clear unbound dye; a single wash leaves non-specific signal (this mirrors the wash policy carried into F5 from the F6 controls work).",
      "Corrective action: restore the 3× PBS wash step; repeat folded into the optimized protocol (2025-04-22).",
    ],
    measurement: { name: "Signal-to-background", value: 2.4, unit: "a.u." },
    deviation: {
      expected: "≥ 3× PBS washes to clear unbound dye",
      actual: "a single (1×) PBS rinse",
      reason: "residual unbound CMXRos and Hoechst 33342 raised background",
      severity: "major",
    },
    verdict: "failure",
    reason: "insufficient washing (1× instead of 3×) left high background and poor signal-to-noise",
  },

  // 5 ── 2025-03-18 · three-color (Deep Red + Hoechst + GFP) compensation · partial · spectral bleed-through
  {
    slug: "multiplex-three-color-bleedthrough-hela",
    date: "2025-03-18",
    cellLine: "HeLa",
    params: { mitotracker_conc: 200, hoechst_conc: 1600, staining_incubation_time: 35, pfa_exposure_time: 10, imaging_exposure: 3 },
    notes: [
      "2025-03-18 · operator Emmanuel Djezvedjian. Three-color extension on HeLa: MitoTracker Deep Red FM 200 nM (far-red mitochondria) + Hoechst 33342 1600 nM (blue nuclei) + an endogenous GFP reporter (green), fixed in 4% PFA 10 min and imaged on the Zeiss LSM 900.",
      "Deep Red was chosen for the mito channel to move it away from GFP spectrally; it is a fixable but ΔΨm-dependent probe (not a mitochondrial-mass marker), consistent with the F1/F6 caveat.",
      "Partial result: the far-red (Deep Red) and blue (Hoechst) channels were clean, but Hoechst 33342 emission bled into the green channel, producing false GFP+ background — the GFP-channel signal-to-background sat at ~3.5, well below usable.",
      "Compensation / spectral unmixing only partly corrected the Hoechst→GFP bleed-through at 1600 nM Hoechst; the two-color mito+nucleus readout is trustworthy, the third (GFP) channel is not yet.",
      "Deviation logged against the F5 spectral-overlap threshold: overlapping channels need compensation/unmixing set up correctly, and Hoechst should be dropped to reduce the green bleed.",
      "Corrective action for the optimized protocol (2025-04-22): lower Hoechst to ~1200 nM and finalize compensation, keeping Deep Red for the far-red separation.",
    ],
    measurement: { name: "Signal-to-background (GFP channel)", value: 3.5, unit: "a.u." },
    deviation: {
      expected: "compensation / spectral unmixing for overlapping channels, with Hoechst kept low enough to avoid green bleed",
      actual: "three-color acquisition at 1600 nM Hoechst with incomplete compensation → Hoechst bleed-through into the GFP channel",
      reason: "spectral overlap not fully compensated",
      severity: "major",
    },
    verdict: "partial",
    reason: "spectral overlap — Hoechst→GFP bleed-through with incomplete compensation",
  },

  // 6 ── 2025-04-22 · optimized multiplex protocol · success · final workflow
  {
    slug: "multiplex-optimized-final-hela",
    date: "2025-04-22",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, hoechst_conc: 1200, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 2 },
    notes: [
      "2025-04-22 · operator Emmanuel Djezvedjian. Optimized multiplex protocol on HeLa, folding in every lesson: MitoTracker Red CMXRos 150 nM + Hoechst 33342 lowered to 1200 nM (30 min staining), 3× PBS wash, 4% PFA 10 min, 3× PBS wash, ProLong Glass anti-fade mountant, imaged at low laser / 2 ms dwell on the Zeiss LSM 900.",
      "All the earlier failure modes are controlled: 3× PBS wash clears background (vs the 2025-02-18 under-wash), anti-fade + 2 ms dwell prevents z-stack bleaching (vs the 2025-01-21 over-exposure), and the lower 1200 nM Hoechst with compensation removes the green bleed-through (vs the 2025-03-18 three-color partial).",
      "Result: a clean two-color image with signal-to-background ~15 — the best of the series — and < 10% bleaching across a 20-plane z-stack, with the bleach-sensitive red channel acquired last.",
      "No deviations. This is the final, reproducible F5 workflow; queued for a cross-cell-line replicate (U2OS, 2025-06-17).",
    ],
    measurement: { name: "Signal-to-background", value: 15, unit: "a.u." },
    verdict: "success",
  },

  // 7 ── 2025-06-17 · U2OS replicate of final workflow · success
  {
    slug: "multiplex-optimized-replicate-u2os",
    date: "2025-06-17",
    cellLine: "U2OS",
    params: { mitotracker_conc: 150, hoechst_conc: 1200, staining_incubation_time: 30, pfa_exposure_time: 10, imaging_exposure: 2 },
    notes: [
      "2025-06-17 · operator Emmanuel Djezvedjian. Cross-cell-line replicate of the optimized F5 workflow on U2OS: MitoTracker Red CMXRos 150 nM + Hoechst 33342 1200 nM, 3× PBS wash, 4% PFA 10 min, ProLong Glass anti-fade mountant, low laser / 2 ms dwell — identical settings to the 2025-04-22 HeLa run.",
      "U2OS are flatter and larger than HeLa, giving well-spread mitochondrial networks that are ideal for confocal; the protocol transferred without changes.",
      "Reproduced the HeLa result closely: signal-to-background ~14 (vs ~15 on HeLa), clean channel separation and < 10% z-stack bleaching — confirming the workflow generalizes across cell lines.",
      "No deviations. Completes the F5 multiplex protocol as a validated, cross-line two-color confocal imaging workflow.",
    ],
    measurement: { name: "Signal-to-background", value: 14, unit: "a.u." },
    verdict: "success",
  },
];

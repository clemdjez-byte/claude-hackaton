// scripts/fluo-runs-f3.ts — run inventory for Protocol F3
// "Mitochondrial membrane potential by flow cytometry (TMRM/TMRE/JC-1)".
// Each RunSpec drives the pipeline (started run → evidence → signed report →
// verdict → RAG + Knowledge Graph). Param keys (numbers only):
// membrane_potential_probe_conc (nM), staining_incubation_time (min),
// depolarizer_conc (µM). Primary metric = MFI (a.u.) for TMRM/TMRE, or the
// red/green ratio for JC-1. ⚠️ thresholds (quench-mode over-concentration,
// missing FCCP/CCCP control, loading order) become failure_mode nodes.
import type { RunSpec } from "./aml-common";

export const F3_RUNS: RunSpec[] = [
  // 1 ── 2023-10-24 · TMRM 50 nM, non-quench · success · baseline MFI
  {
    slug: "tmrm-baseline-hela",
    date: "2023-10-24",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 50, staining_incubation_time: 30, depolarizer_conc: 0 },
    notes: [
      "2023-10-24 · operator Emmanuel Djezvedjian. Mitochondrial membrane potential (ΔΨm) baseline on HeLa by flow cytometry: TMRM 50 nM, non-quench mode, 30 min at 37 °C in phenol-red-free medium, single wash, acquired on the BD LSRFortessa — the reference MFI for the whole ΔΨm series.",
      "TMRM is a Nernstian cationic probe that accumulates in polarized mitochondria; at 50 nM the cells sit in the non-quench regime (20–100 nM), so median fluorescence intensity (MFI) tracks potential monotonically rather than self-quenching.",
      "Healthy asynchronous HeLa (~60% confluent) gave a tight single population at MFI ~4200 a.u. with low CV — a clean, reproducible starting point.",
      "No depolarizer in this arm — it is the untreated reference. The paired FCCP depolarization control that proves the signal is potential-dependent comes next in the TMRE series (2023-12-19).",
      "Loading order fixed as pre-load (probe before any treatment) and logged, so later arms stay comparable; deviating from it later confounds quantification (cf. 2024-04-16).",
      "Gated on FSC/SSC singlets, live cells only; consistent with the live-cell TMRM/TMRE ΔΨm range reported in IJMS 2021 (ijms-22-06263).",
    ],
    measurement: { name: "TMRM MFI (baseline)", value: 4200, unit: "a.u." },
    verdict: "success",
  },

  // 2 ── 2023-11-21 · TMRE 25 nM · success · MFI
  {
    slug: "tmre-baseline-hela",
    date: "2023-11-21",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 25, staining_incubation_time: 20, depolarizer_conc: 0 },
    notes: [
      "2023-11-21 · operator Emmanuel Djezvedjian. ΔΨm on HeLa by flow cytometry with TMRE 25 nM, non-quench mode, 20 min at 37 °C, acquired on the BD LSRFortessa — the TMRE counterpart to the 2023-10-24 TMRM baseline.",
      "TMRE (the ethyl ester of TMRM) is likewise Nernstian; 25 nM is comfortably inside the 20–100 nM non-quench window, so MFI reads potential linearly.",
      "Single polarized population at MFI ~3100 a.u.; the lower absolute value vs the 50 nM TMRM baseline is expected from the lower concentration and different probe, not a biological difference.",
      "No depolarization control in this run — it establishes the TMRE loading and instrument settings; the FCCP validation is run on the next TMRE plate (2023-12-19).",
      "Compensation/voltages set on the PE (yellow-green) detector; unstained and single-stain references collected to place the negative and confirm no spillover.",
      "Pre-load loading order kept identical to the TMRM baseline so the two probes are directly comparable.",
    ],
    measurement: { name: "TMRE MFI", value: 3100, unit: "a.u." },
    verdict: "success",
  },

  // 3 ── 2023-12-19 · TMRE 25 nM + FCCP 20 µM · success · MFI collapses (validated)
  {
    slug: "tmre-fccp-potential-dependence",
    date: "2023-12-19",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 25, staining_incubation_time: 20, depolarizer_conc: 20 },
    notes: [
      "2023-12-19 · operator Emmanuel Djezvedjian. Potential-dependence validation on HeLa: TMRE 25 nM (non-quench, 20 min, 37 °C) run as paired arms — untreated vs FCCP 20 µM (30 min) — on the BD LSRFortessa.",
      "FCCP is a protonophore that dissipates the proton gradient and collapses ΔΨm; if the TMRE signal is genuinely potential-dependent, the FCCP arm MFI must fall sharply.",
      "Untreated arm MFI ~3050 a.u. (matching the 2023-11-21 TMRE baseline); the FCCP arm collapsed to ~380 a.u. — an ~88% drop — proving TMRE reports membrane potential and not inert dye mass.",
      "This is the same potential-dependence logic used for the fixable MitoTracker probes in F1 (the CMXRos/Deep Red FCCP spot-check) and catalogued as the potential-dependence panel in F6.",
      "With the depolarization control passing, the TMRE readout is now interpretable as ΔΨm — the missing-control failure mode (2024-01-16) is exactly what this arm guards against.",
      "Gating and loading order identical to the untreated arm; the only variable is FCCP, so the MFI collapse is attributable to depolarization alone.",
    ],
    measurement: { name: "TMRE MFI (+FCCP 20 µM)", value: 380, unit: "a.u." },
    verdict: "success",
  },

  // 4 ── 2024-01-16 · TMRM 50 nM, no FCCP control · failure · ΔΨm uninterpretable
  {
    slug: "tmrm-missing-fccp-control",
    date: "2024-01-16",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 50, staining_incubation_time: 30, depolarizer_conc: 0 },
    notes: [
      "2024-01-16 · operator Emmanuel Djezvedjian. TMRM 50 nM (non-quench, 30 min, 37 °C) on HeLa comparing an untreated arm with a candidate mitochondrial stressor, acquired on the BD LSRFortessa — intended to claim a treatment-induced ΔΨm drop.",
      "The stressor arm showed a lower TMRM MFI (~2650 a.u.) than untreated (~4150 a.u.), which at face value looks like depolarization.",
      "But NO FCCP/CCCP depolarization control was run on this plate, so there is no positive anchor proving the probe is behaving Nernstian on the day — a lower MFI could equally come from dye loss, quenching, fewer/smaller mitochondria, or acquisition drift.",
      "Without the depolarization control the ΔΨm claim is uninterpretable: the assay cannot distinguish a genuine potential change from a mass or loading artifact (contrast the validated 2023-12-19 TMRE + FCCP run).",
      "This is precisely the missing-depolarization-control failure mode flagged in the F3 protocol and in the F6 controls panel.",
      "Corrective action: re-run with a paired FCCP 20 µM arm (and ideally a CCCP dose-response) before any ΔΨm conclusion is recorded.",
    ],
    measurement: { name: "TMRM MFI (stressor arm)", value: 2650, unit: "a.u." },
    deviation: {
      expected: "paired FCCP/CCCP depolarization control proving potential-dependence",
      actual: "TMRM 50 nM measured with no depolarization control",
      reason: "no depolarization control → ΔΨm readout uninterpretable",
      severity: "major",
    },
    verdict: "failure",
    reason: "missing FCCP/CCCP depolarization control — ΔΨm claim uninterpretable",
  },

  // 5 ── 2024-02-13 · quench-mode 400 nM artifact · partial · paradoxical/inverted signal
  {
    slug: "tmrm-quench-mode-overconcentration",
    date: "2024-02-13",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 400, staining_incubation_time: 30, depolarizer_conc: 20 },
    notes: [
      "2024-02-13 · operator Emmanuel Djezvedjian. TMRM loaded at 400 nM on HeLa (30 min, 37 °C) with a paired FCCP 20 µM arm, acquired on the BD LSRFortessa — inadvertently run in quench mode, well above the 20–100 nM non-quench window.",
      "At 400 nM TMRM accumulates so densely in polarized mitochondria that it self-quenches, so the fluorescence–potential relationship inverts: more polarization gives LOWER signal, not higher.",
      "The tell-tale appeared in the control arm — FCCP (which depolarizes and should collapse a non-quench signal) instead RAISED whole-cell MFI from ~5200 to ~7400 a.u. as the concentrated dye dequenched and redistributed.",
      "This inverted/paradoxical response is the opposite of the validated non-quench behavior on 2023-12-19, and it makes a naive 'higher MFI = higher ΔΨm' reading wrong.",
      "The result is salvageable only qualitatively (the dequenching confirms the mitochondria were polarized), so it is logged as partial, not a clean success — the quantification is unusable as-is.",
      "Fix: drop back to 20–100 nM non-quench (e.g. the 50 nM TMRM baseline of 2023-10-24), or commit to a proper quench-mode protocol with the inverted interpretation applied consistently.",
    ],
    measurement: { name: "TMRM MFI (400 nM, quench mode)", value: 5200, unit: "a.u." },
    deviation: {
      expected: "non-quench probe range 20–100 nM",
      actual: "TMRM 400 nM (quench mode)",
      reason: "quench-mode over-concentration → self-quenching, paradoxical/inverted signal",
      severity: "major",
    },
    verdict: "partial",
    reason: "quench-mode over-concentration (400 nM) → paradoxical/inverted signal",
  },

  // 6 ── 2024-03-12 · JC-1 ratiometric · success · red/green ratio
  {
    slug: "jc1-ratiometric-hela",
    date: "2024-03-12",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 2000, staining_incubation_time: 20, depolarizer_conc: 20 },
    notes: [
      "2024-03-12 · operator Emmanuel Djezvedjian. ΔΨm on HeLa by the ratiometric probe JC-1 (~2 µM, 20 min, 37 °C) with a paired FCCP 20 µM arm, acquired on the BD LSRFortessa.",
      "JC-1 is ratiometric: in polarized mitochondria it forms red-fluorescent J-aggregates, while depolarized mitochondria retain the green monomer — so ΔΨm is read as the red/green ratio, largely independent of mitochondrial mass and loading.",
      "Untreated HeLa gave a red/green ratio of ~5.2, and the FCCP arm collapsed it to ~0.7 — the aggregate (red) signal fell and the monomer (green) rose, exactly the expected depolarization response.",
      "The ratiometric readout is internally self-controlled, which sidesteps the absolute-MFI loading/quenching pitfalls seen with TMRM/TMRE (cf. the 2024-02-13 quench-mode artifact).",
      "Consistent with the TMRE potential-dependence validated on 2023-12-19 — a second, orthogonal probe agreeing that the HeLa population is polarized at baseline.",
      "Green (FITC) and red (PE) detectors compensated with single-stain controls; the ratio was computed per-cell then summarized as the population median.",
    ],
    measurement: { name: "JC-1 red/green ratio", value: 5.2, unit: "ratio" },
    verdict: "success",
  },

  // 7 ── 2024-04-16 · loading order post-treatment vs pre-load, TMRE · partial · confounded
  {
    slug: "tmre-loading-order-confound",
    date: "2024-04-16",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 25, staining_incubation_time: 30, depolarizer_conc: 0 },
    notes: [
      "2024-04-16 · operator Emmanuel Djezvedjian. TMRE 25 nM (non-quench, 30 min, 37 °C) on HeLa comparing a mitochondrial stressor to untreated, but with inconsistent probe loading order between the two arms, acquired on the BD LSRFortessa.",
      "One arm was pre-loaded (TMRE before treatment, as in the 2023-10-24 baseline); the other was loaded post-treatment (TMRE added after the stressor).",
      "Loading order changes the equilibrium the Nernstian probe reaches: post-treatment loading lets an already-altered ΔΨm set the uptake, while pre-loading captures the transition — so the two arms are not measuring the same thing.",
      "The numbers disagreed accordingly — post-load arm MFI ~3300 a.u. vs pre-load arm ~2400 a.u. for a nominally similar condition — a ~38% discrepancy attributable to loading order alone, not biology.",
      "Because the quantitative comparison is confounded, the run is logged as partial: the direction is suggestive but the effect size is not trustworthy.",
      "Corrective action: fix a single loading order (pre-load) across all arms, per the F3 acquisition step, and re-run before quantifying.",
    ],
    measurement: { name: "TMRE MFI (post-load arm)", value: 3300, unit: "a.u." },
    deviation: {
      expected: "consistent loading order (pre-load) across all arms",
      actual: "TMRE pre-loaded in one arm, loaded post-treatment in the other",
      reason: "inconsistent loading order → confounded ΔΨm quantification",
      severity: "major",
    },
    verdict: "partial",
    reason: "inconsistent loading order (pre-load vs post-treatment) confounded quantification",
  },

  // 8 ── 2024-05-14 · CCCP dose-response 5/10/20/40 µM, TMRE · success · dose-dependent
  {
    slug: "cccp-dose-response-tmre",
    date: "2024-05-14",
    cellLine: "HeLa",
    params: { membrane_potential_probe_conc: 25, staining_incubation_time: 30, depolarizer_conc: 40 },
    notes: [
      "2024-05-14 · operator Emmanuel Djezvedjian. CCCP dose-response on HeLa read by TMRE 25 nM (non-quench, 30 min, 37 °C) on the BD LSRFortessa — untreated plus CCCP at 5, 10, 20 and 40 µM (30 min).",
      "CCCP is a protonophore like FCCP (the sibling depolarizer used on 2023-12-19); a graded dose should give graded depolarization if TMRE is truly potential-dependent.",
      "TMRE MFI fell monotonically with dose: untreated ~3000 → 5 µM ~2100 → 10 µM ~1300 → 20 µM ~600 → 40 µM ~340 a.u., a clean dose-dependent collapse.",
      "The smooth dose-response is a stronger validation than a single depolarizer point — it shows the probe tracks ΔΨm continuously, not just at a saturating dose.",
      "Half-maximal depolarization sat around ~10–15 µM CCCP, consistent with the 10–40 µM depolarization-control range in the F3/F6 protocols.",
      "Pre-load loading order and gating identical across all five arms, so the only variable is CCCP concentration — the dose-response is attributable to depolarization alone.",
    ],
    measurement: { name: "TMRE MFI (40 µM CCCP)", value: 340, unit: "a.u." },
    verdict: "success",
  },
];

// scripts/fluo-runs-f1.ts — run inventory for Protocol F1
// "Live-cell mitochondrial staining with MitoTracker (dye selection & loading)".
// Each RunSpec is the free-text material the pipeline turns into a signed report
// and the AI turns into the knowledge graph (dyes, cell lines, parameter values,
// failure modes). Param keys (numbers only): mitotracker_conc (nM),
// staining_incubation_time (min), cell_density (cells/mL).
// Primary metric = staining index (signal/background, a.u.) unless noted.
import type { RunSpec } from "./aml-common";

export const F1_RUNS: RunSpec[] = [
  // 1 ── 2023-01-17 · Green FM 100 nM · HeLa · success · staining index ~9
  {
    slug: "mitotracker-green-baseline-hela",
    date: "2023-01-17",
    cellLine: "HeLa",
    params: { mitotracker_conc: 100, staining_incubation_time: 30, cell_density: 100000 },
    notes: [
      "2023-01-17 · operator Emmanuel Djezvedjian. Live-cell mitochondrial staining: MitoTracker Green FM 100 nM on HeLa (~60% confluent), 30 min at 37 °C in phenol-red-free medium, single PBS wash, imaged live on the Zeiss LSM 900.",
      "Clean filamentous mitochondrial network with low cytoplasmic background; staining index ~9 (signal/background).",
      "MitoTracker Green FM is a live-only probe — not retained on fixation — so the sample was imaged live rather than fixed.",
      "This is the reference baseline for the Green FM loading titration (cf. 2023-02-14) and for the U2OS replicate (cf. 2023-05-16).",
      "No deviations; 100 nM sits inside the 100–200 nM signal-to-noise optimum. Cross-ref the fixable-dye baseline (MitoTracker Red CMXRos, 2023-01-31) chosen for fixed endpoints.",
    ],
    measurement: { name: "Staining index", value: 9, unit: "a.u." },
    verdict: "success",
  },

  // 2 ── 2023-01-31 · CMXRos 150 nM · HeLa · success · staining index ~8.2
  {
    slug: "cmxros-fixable-baseline-hela",
    date: "2023-01-31",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, staining_incubation_time: 30, cell_density: 95000 },
    notes: [
      "2023-01-31 · operator Emmanuel Djezvedjian. MitoTracker Red CMXRos 150 nM on HeLa (~65% confluent), 30 min at 37 °C in phenol-red-free medium, 3× PBS wash, imaged live on the Zeiss LSM 900.",
      "Bright, well-resolved mitochondrial network; staining index ~8.2 (signal/background), a touch below the Green FM live baseline (cf. 2023-01-17) as expected for a ΔΨm-dependent probe.",
      "Unlike MitoTracker Green FM, CMXRos is fixable and its uptake is ΔΨm-dependent — it accumulates in polarized mitochondria and is retained through PFA fixation, making it the dye of choice for fixed endpoints.",
      "This is the fixable-dye baseline referenced by the fixation work (F4/F5) and by the FCCP depolarization spot-check (cf. 2023-07-11), where the same 150 nM load is challenged with a depolarizer.",
      "No deviations; 150 nM is within the CMXRos 100–500 nM range and near the 100–200 nM SNR optimum.",
    ],
    measurement: { name: "Staining index", value: 8.2, unit: "a.u." },
    verdict: "success",
  },

  // 3 ── 2023-02-14 · Green FM loading titration 25/100/250/500 nM · HeLa · success
  {
    slug: "greenfm-loading-titration-hela",
    date: "2023-02-14",
    cellLine: "HeLa",
    params: { mitotracker_conc: 100, staining_incubation_time: 30, cell_density: 110000 },
    notes: [
      "2023-02-14 · operator Emmanuel Djezvedjian. MitoTracker Green FM loading titration on HeLa (25 / 100 / 250 / 500 nM), 30 min at 37 °C in phenol-red-free medium, single PBS wash, imaged live on the Zeiss LSM 900.",
      "Staining index rose then fell across the series: 25 nM ~3.2 (faint, under-stained), 100 nM ~9.1 (clean network), 250 nM ~6.5 (cytoplasmic background creeping up), 500 nM ~3.8 (heavy non-specific cytoplasmic background).",
      "Signal-to-noise optimum is ~100–200 nM; below ~25 nM the network is under-stained and at/above ~500 nM background dominates and SNR collapses.",
      "Anchored to the 100 nM Green FM baseline (cf. 2023-01-17); the 500 nM datapoint foreshadows the deliberate over-concentration run (cf. 2023-03-07).",
      "No deviations — the titration was the intended design. Selected 100 nM as the working concentration for subsequent Green FM live imaging.",
    ],
    measurement: { name: "Staining index (100 nM optimum)", value: 9.1, unit: "a.u." },
    verdict: "success",
  },

  // 4 ── 2023-03-07 · CMXRos 500 nM over-concentration · HeLa · partial · background
  {
    slug: "cmxros-overconcentration-background-hela",
    date: "2023-03-07",
    cellLine: "HeLa",
    params: { mitotracker_conc: 500, staining_incubation_time: 30, cell_density: 105000 },
    notes: [
      "2023-03-07 · operator Emmanuel Djezvedjian. MitoTracker Red CMXRos deliberately loaded at 500 nM on HeLa (~60% confluent), 30 min at 37 °C, 3× PBS wash, imaged live on the Zeiss LSM 900 to probe the over-concentration ceiling.",
      "The mitochondrial network was still visible but sat on strong non-specific cytoplasmic background; staining index fell to ~3.5 versus ~8.2 for the 150 nM CMXRos baseline (cf. 2023-01-31).",
      "This reproduces the top of the Green FM titration (500 nM datapoint, cf. 2023-02-14): at/above ~500 nM the dye stains diffusely beyond mitochondria and signal-to-noise collapses.",
      "Partial result — the signal is recoverable by dropping back to the 100–200 nM optimum, but at 500 nM the readout is unreliable and not usable as-is.",
      "Deviation logged against the loading step: working concentration exceeded the ~500 nM ceiling, giving non-specific cytoplasmic background.",
    ],
    measurement: { name: "Staining index", value: 3.5, unit: "a.u." },
    deviation: {
      expected: "≤ ~200 nM working concentration (100–200 nM optimum)",
      actual: "500 nM MitoTracker Red CMXRos",
      reason: "over-concentration causes non-specific cytoplasmic/background staining",
      severity: "minor",
    },
    verdict: "partial",
    reason: "dye over-concentration (500 nM) — non-specific cytoplasmic background collapsed SNR",
  },

  // 5 ── 2023-03-28 · Green FM 15 nM / 10 min under-staining · HeLa · failure
  {
    slug: "greenfm-understaining-hela",
    date: "2023-03-28",
    cellLine: "HeLa",
    params: { mitotracker_conc: 15, staining_incubation_time: 10, cell_density: 90000 },
    notes: [
      "2023-03-28 · operator Emmanuel Djezvedjian. MitoTracker Green FM at just 15 nM for only 10 min at 37 °C on HeLa (~60% confluent), single PBS wash, imaged live on the Zeiss LSM 900.",
      "Signal was near-undetectable — staining index ~1.4, barely above autofluorescence background and far below the ~9 Green FM baseline (cf. 2023-01-17).",
      "Both the concentration (15 nM, below the ~20 nM floor) and the loading time (10 min, below the 15 min minimum) were under threshold, so mitochondria never accumulated enough dye.",
      "Failure — the image cannot be scored; needs re-staining at ≥ 100 nM for ≥ 30 min (cf. the titration, 2023-02-14).",
      "Deviation logged: dye concentration and loading time both below the loading-step minimum.",
    ],
    measurement: { name: "Staining index", value: 1.4, unit: "a.u." },
    deviation: {
      expected: "≥ 100 nM for ≥ 30 min (optimum 100–200 nM)",
      actual: "15 nM for 10 min",
      reason: "concentration and loading time below the minimum — under-staining",
      severity: "critical",
    },
    verdict: "failure",
    reason: "under-staining — dye concentration and loading time below the minimum, signal near background",
  },

  // 6 ── 2023-04-18 · Green FM then PFA-fixed · HeLa · failure · signal lost
  {
    slug: "greenfm-then-pfa-signal-lost",
    date: "2023-04-18",
    cellLine: "HeLa",
    params: { mitotracker_conc: 100, staining_incubation_time: 30, cell_density: 100000 },
    notes: [
      "2023-04-18 · operator Emmanuel Djezvedjian. MitoTracker Green FM 100 nM on HeLa (30 min, 37 °C), then fixed in freshly prepared 4% PFA (10 min, 3× PBS wash) before imaging on the Zeiss LSM 900.",
      "Post-fixation the mitochondrial signal was almost entirely lost — staining index ~1.3 versus ~9 for the same load imaged live (cf. 2023-01-17).",
      "MitoTracker Green FM is a live-only probe: it is not covalently retained and washes out during PFA fixation, so a fixed endpoint erases the signal.",
      "Wrong dye for the endpoint — for fixed imaging use a fixable ΔΨm dye (MitoTracker Red CMXRos, cf. 2023-01-31, or MitoTracker Deep Red FM), which survives PFA fixation (see the fixation work, F4/F5).",
      "Deviation logged: a live-only dye was used ahead of a fixation step.",
    ],
    measurement: { name: "Staining index (post-fix)", value: 1.3, unit: "a.u." },
    deviation: {
      expected: "fixable ΔΨm dye for a fixed endpoint (CMXRos / Deep Red FM)",
      actual: "MitoTracker Green FM then 4% PFA fixation",
      reason: "live-only dye not retained after fixation",
      severity: "major",
    },
    verdict: "failure",
    reason: "wrong dye for fixed cells — MitoTracker Green FM lost on fixation",
  },

  // 7 ── 2023-05-16 · U2OS replicate · Green FM 100 nM · success · staining index ~8.6
  {
    slug: "greenfm-baseline-u2os-replicate",
    date: "2023-05-16",
    cellLine: "U2OS",
    params: { mitotracker_conc: 100, staining_incubation_time: 30, cell_density: 80000 },
    notes: [
      "2023-05-16 · operator Emmanuel Djezvedjian. MitoTracker Green FM 100 nM on U2OS (~65% confluent), 30 min at 37 °C in phenol-red-free medium, single PBS wash, imaged live on the Zeiss LSM 900 — a cross-cell-line replicate of the HeLa baseline.",
      "Clean filamentous mitochondrial network with low background; staining index ~8.6, closely matching the HeLa Green FM baseline (~9, cf. 2023-01-17).",
      "Confirms the 100 nM / 30 min live-load transfers to U2OS with no re-optimization — reproducibility across cell lines.",
      "U2OS was seeded a little sparser (~8 × 10^4 cells/mL) to hit the same ~60–70% confluence window and avoid patchy uptake (cf. the over-confluent partial, 2023-06-13).",
      "No deviations; Green FM again imaged live (not retained on fixation).",
    ],
    measurement: { name: "Staining index", value: 8.6, unit: "a.u." },
    verdict: "success",
  },

  // 8 ── 2023-06-13 · over-confluent culture, patchy uptake · HeLa · partial
  {
    slug: "overconfluent-patchy-uptake-hela",
    date: "2023-06-13",
    cellLine: "HeLa",
    params: { mitotracker_conc: 100, staining_incubation_time: 30, cell_density: 350000 },
    notes: [
      "2023-06-13 · operator Emmanuel Djezvedjian. MitoTracker Green FM 100 nM on an over-confluent HeLa monolayer (~100% confluent, seeded/grown too dense), 30 min at 37 °C, single PBS wash, imaged live on the Zeiss LSM 900.",
      "Dye uptake was uneven and patchy: brightly stained cells sat next to weakly stained neighbours, with a high field coefficient of variation (~48%) despite the identical 100 nM load that gave a clean network at ~60% confluence (cf. 2023-01-17).",
      "Cause is the over-confluent culture — crowded cells take up MitoTracker unevenly, so a mean staining index is misleading and per-cell uniformity is the informative metric here.",
      "Partial — usable only after re-seeding to ~60–70% confluence; the load itself is correct, the culture state is not (cf. the sparser U2OS replicate, 2023-05-16).",
      "Deviation logged against the seeding step: culture over-confluent at the time of staining.",
    ],
    measurement: { name: "Staining uniformity (field CV)", value: 48, unit: "%" },
    deviation: {
      expected: "~60–70% confluence at staining",
      actual: "over-confluent monolayer (~100%)",
      reason: "over-confluence causes uneven, patchy dye uptake",
      severity: "minor",
    },
    verdict: "partial",
    reason: "over-confluent culture — uneven, patchy dye uptake",
  },

  // 9 ── 2023-07-11 · CMXRos + FCCP depolarization spot-check · HeLa · success
  {
    slug: "cmxros-fccp-depolarization-spotcheck-hela",
    date: "2023-07-11",
    cellLine: "HeLa",
    params: { mitotracker_conc: 150, staining_incubation_time: 30, cell_density: 100000 },
    notes: [
      "2023-07-11 · operator Emmanuel Djezvedjian. Paired FCCP depolarization spot-check on HeLa: two arms of MitoTracker Red CMXRos 150 nM (30 min, 37 °C), one arm co-treated with the depolarizer FCCP (20 µM, 45 min), 3× PBS wash, imaged live on the Zeiss LSM 900.",
      "Control arm reproduced the CMXRos baseline (staining index ~8, cf. 2023-01-31); the FCCP arm signal collapsed to ~1.8 — retention ~22% — as the mitochondria depolarized.",
      "The signal drop on depolarization proves CMXRos uptake is ΔΨm-dependent (Nernstian accumulation in polarized mitochondria), not a pure mitochondrial-mass readout.",
      "Practical caveat for the whole panel: MitoTracker Red CMXRos and Deep Red FM must be interpreted as membrane-potential probes, not mass markers (cf. the controls/validation protocol, F6; related ΔΨm work with TMRM/TMRE, F3).",
      "No deviations — the control behaved exactly as expected, validating the CMXRos readout reused across the fixation and multiplex protocols (F4/F5).",
    ],
    measurement: { name: "CMXRos signal retention after FCCP", value: 22, unit: "%" },
    verdict: "success",
  },
];

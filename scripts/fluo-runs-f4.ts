// scripts/fluo-runs-f4.ts — run-spec seed for F4 "PFA fixation optimized for
// fluorescence retention". Each run's free-text notes are what the AI reads to
// build the knowledge graph (cell lines, reagents, parameter values, failure
// modes). English only; notes[0] carries the historical date + operator for the
// KG date node. Param keys (numbers only): pfa_exposure_time (min),
// fixative_pct (%), fixation_temp (°C). Primary metric: signal retention %
// (post-fix / pre-fix signal).
import type { RunSpec } from "./aml-common";

export const F4_RUNS: RunSpec[] = [
  // 1 ── 4% PFA / 10 min / RT / CMXRos — retention baseline (success)
  {
    slug: "pfa-4pct-10min-cmxros-hela-retention-baseline",
    date: "2024-04-23",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 10, fixative_pct: 4, fixation_temp: 22 },
    notes: [
      "2024-04-23 · operator Emmanuel Djezvedjian. Fixation retention baseline: HeLa stained live with MitoTracker Red CMXRos (150 nM, 30 min at 37 °C), then fixed in freshly prepared 4% paraformaldehyde (PFA) for 10 min at room temperature (22 °C), washed 3× PBS and imaged on the Zeiss LSM 900.",
      "CMXRos is a fixable, ΔΨm-dependent probe, so the pre-fix filamentous mitochondrial network was compared field-for-field with the same cells post-fix; morphology and intensity were well preserved.",
      "Post-fix / pre-fix signal retention ~92% — the target for this optimization and the reference all later PFA arms read against.",
      "Standard-condition anchor: 4% PFA, 10 min, RT, freshly prepared fixative, 3× PBS wash. Establishes that a fixable ΔΨm dye survives routine PFA fixation.",
    ],
    measurement: { name: "Signal retention", value: 92, unit: "%" },
    verdict: "success",
  },

  // 2 ── 3% PFA / 15 min / RT / CMXRos — lower-percentage variant (success)
  {
    slug: "pfa-3pct-15min-cmxros-hela-retention",
    date: "2024-05-21",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 15, fixative_pct: 3, fixation_temp: 22 },
    notes: [
      "2024-05-21 · operator Emmanuel Djezvedjian. HeLa stained live with MitoTracker Red CMXRos (150 nM), fixed in freshly prepared 3% PFA for 15 min at room temperature (22 °C), washed 3× PBS, imaged on the Zeiss LSM 900.",
      "Lower-percentage / longer-time variant of the 2024-04-23 4%/10 min baseline — tests whether a gentler PFA concentration held longer preserves CMXRos equally well.",
      "Signal retention ~88%, marginally below the 4%/10 min arm (~92%) but comfortably inside the recommended 3–4% PFA, 10–15 min window; post-fix morphology comparable.",
      "Confirms the protocol's 3–4% / 10–15 min range is robust for fixable ΔΨm dyes; 4%/10 min stays the preferred anchor.",
    ],
    measurement: { name: "Signal retention", value: 88, unit: "%" },
    verdict: "success",
  },

  // 3 ── PFA-only (4%) on a TMRE sample — ΔΨm signal lost (failure, deviation)
  {
    slug: "pfa-only-tmre-deltapsi-lost-hela",
    date: "2024-06-18",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 10, fixative_pct: 4, fixation_temp: 22 },
    notes: [
      "2024-06-18 · operator Emmanuel Djezvedjian. HeLa loaded live with TMRE (50 nM, non-quench mode) then fixed PFA-only — 4% PFA, 10 min at 22 °C, 3× PBS wash — before imaging on the Zeiss LSM 900.",
      "Unlike the fixable CMXRos baseline (2024-04-23, ~92% retained), the TMRE signal was almost entirely lost after PFA-only fixation.",
      "TMRE is a Nernstian ΔΨm probe held in mitochondria by membrane potential; plain PFA does not covalently trap it, so the dye redistributes and washes out during fixation.",
      "Signal retention ~15% — a failure. The fix is to add 0.1% glutaraldehyde (GA) to the PFA (PFA+GA, Qin 2021), tested next on 2024-07-16.",
    ],
    measurement: { name: "Signal retention", value: 15, unit: "%" },
    deviation: {
      expected: "PFA + 0.1% glutaraldehyde (GA) for a ΔΨm dye (TMRE)",
      actual: "PFA-only (4%) fixation of a TMRE-stained sample",
      reason: "PFA alone does not retain potential-dependent TMRE signal",
      severity: "major",
    },
    verdict: "failure",
    reason: "PFA-only on a ΔΨm probe — TMRE signal not retained without glutaraldehyde",
  },

  // 4 ── PFA + 0.1% GA on a TMRE sample — retained (success, Qin 2021)
  {
    slug: "pfa-ga-tmre-retained-hela",
    date: "2024-07-16",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 12, fixative_pct: 4, fixation_temp: 22 },
    notes: [
      "2024-07-16 · operator Emmanuel Djezvedjian. HeLa loaded live with TMRE (50 nM), fixed in 4% PFA + 0.1% glutaraldehyde (GA), 12 min at 22 °C, washed 3× PBS, imaged on the Zeiss LSM 900.",
      "Direct rescue of the 2024-06-18 PFA-only TMRE failure (~15% retained): adding 0.1% GA cross-links more aggressively and traps the potential-dependent dye in place.",
      "Signal retention ~80% — the TMRE mitochondrial pattern was preserved post-fix, a large recovery over PFA-only.",
      "Consistent with Qin 2021 (doi:10.3390/biom11050711): PFA+GA retains ΔΨm-dye signal that PFA alone loses. The GA slightly raises background autofluorescence — the accepted trade-off for retention.",
      "Recommendation: use PFA + 0.1% GA whenever a fixed endpoint is needed for a ΔΨm dye (TMRE/TMRM).",
    ],
    measurement: { name: "Signal retention", value: 80, unit: "%" },
    verdict: "success",
  },

  // 5 ── over-fixation 8% / 30 min / CMXRos — quenching + autofluorescence (failure, deviation)
  {
    slug: "over-fixation-8pct-30min-cmxros-hela",
    date: "2024-08-20",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 30, fixative_pct: 8, fixation_temp: 22 },
    notes: [
      "2024-08-20 · operator Emmanuel Djezvedjian. HeLa stained live with MitoTracker Red CMXRos (150 nM), then deliberately over-fixed in 8% PFA for 30 min at 22 °C, washed 3× PBS, imaged on the Zeiss LSM 900.",
      "Well outside the 3–4% / 10–15 min window — a stress test of over-fixation against the 2024-04-23 4%/10 min baseline (~92% retained).",
      "Two artifacts appeared together: partial quenching of the CMXRos signal and a marked rise in broad-spectrum autofluorescence, so signal-to-background collapsed.",
      "Signal retention fell to ~30% and diffuse autofluorescence made the mitochondrial network hard to segment — a failure driven by over-fixation, not by dye choice.",
      "Keep PFA ≤ 4% and ≤ 10–15 min; higher percentage / longer time buys nothing and costs signal.",
    ],
    measurement: { name: "Signal retention", value: 30, unit: "%" },
    deviation: {
      expected: "≤ 4% PFA for 10–15 min",
      actual: "8% PFA for 30 min (over-fixation)",
      reason: "over-fixation quenches the signal and raises autofluorescence",
      severity: "major",
    },
    verdict: "failure",
    reason: "over-fixation (8% / 30 min) — quenching plus autofluorescence",
  },

  // 6 ── fixation at 4 °C vs RT / CMXRos — morphology comparison (success)
  {
    slug: "fixation-4c-vs-rt-cmxros-hela",
    date: "2024-09-17",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 12, fixative_pct: 4, fixation_temp: 4 },
    notes: [
      "2024-09-17 · operator Emmanuel Djezvedjian. HeLa stained live with MitoTracker Red CMXRos (150 nM), then fixed in 4% PFA for 12 min in paired arms — one at 4 °C (cold) and one at room temperature (22 °C) — 3× PBS wash, imaged on the Zeiss LSM 900.",
      "Temperature comparison at fixed 4% / 12 min: does cold fixation better preserve mitochondrial morphology than RT?",
      "Both arms retained the CMXRos signal well — ~91% at RT and ~90% at 4 °C — with no meaningful intensity difference; the cold arm showed marginally crisper, less-swollen mitochondrial morphology.",
      "Signal retention is temperature-insensitive across 4–22 °C here; 4 °C is a reasonable option when morphology preservation matters, RT is fine for routine work.",
      "Reported value is the 4 °C arm (~90%); both stay near the 2024-04-23 baseline (~92%).",
    ],
    measurement: { name: "Signal retention", value: 90, unit: "%" },
    verdict: "success",
  },

  // 7 ── freshly prepared vs old/aged PFA / CMXRos — weaker fixation (partial, deviation)
  {
    slug: "aged-vs-fresh-pfa-cmxros-hela",
    date: "2024-10-15",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 12, fixative_pct: 4, fixation_temp: 22 },
    notes: [
      "2024-10-15 · operator Emmanuel Djezvedjian. HeLa stained live with MitoTracker Red CMXRos (150 nM), fixed in 4% PFA for 12 min at 22 °C in paired arms — freshly prepared PFA vs an old/aged aliquot (weeks-old, stored at 4 °C) — 3× PBS wash, imaged on the Zeiss LSM 900.",
      "Freshness test at fixed 4% / 12 min / RT: the fresh arm matched the 2024-04-23 baseline (~91% retained).",
      "The aged-PFA arm fixed weakly — formaldehyde depolymerizes on storage, lowering the effective cross-linking concentration — giving softer morphology and more signal lost during washing.",
      "Aged-arm signal retention ~60%: usable but clearly degraded, so this run is partial — the fresh arm succeeds, the aged arm underperforms.",
      "Reinforces the 'freshly prepared PFA' rule; the reported ~60% is the aged arm.",
    ],
    measurement: { name: "Signal retention", value: 60, unit: "%" },
    deviation: {
      expected: "freshly prepared PFA",
      actual: "old/aged PFA aliquot (depolymerized)",
      reason: "aged PFA fixes weakly — lower effective formaldehyde concentration",
      severity: "minor",
    },
    verdict: "partial",
    reason: "aged/old PFA fixed weakly — weaker cross-linking, more signal lost",
  },

  // 8 ── Green FM then fix — negative-control repeat, live-only confirmed (failure, deviation)
  {
    slug: "greenfm-then-fix-negative-control-hela",
    date: "2024-11-19",
    cellLine: "HeLa",
    params: { pfa_exposure_time: 10, fixative_pct: 4, fixation_temp: 22 },
    notes: [
      "2024-11-19 · operator Emmanuel Djezvedjian. Negative-control repeat: HeLa stained live with MitoTracker Green FM (100 nM), then fixed in 4% PFA for 10 min at 22 °C, 3× PBS wash, imaged on the Zeiss LSM 900.",
      "Deliberate repeat of the known live-only failure to reconfirm it inside the fixation-optimization campaign — cf. the 2023-01-17 Green FM live-only baseline and the 2023-04-18 Green-FM-then-PFA loss.",
      "MitoTracker Green FM is not covalently retained by fixation, so post-fix the mitochondrial signal was essentially gone.",
      "Signal retention ~5% — confirms Green FM is a live-only probe; no PFA condition (percentage, time, ±GA) can rescue it. For fixed endpoints use a fixable ΔΨm dye (CMXRos / Deep Red).",
    ],
    measurement: { name: "Signal retention", value: 5, unit: "%" },
    deviation: {
      expected: "a fixable dye for a fixed endpoint (CMXRos / Deep Red)",
      actual: "MitoTracker Green FM then PFA fixation",
      reason: "live-only dye is not retained after fixation",
      severity: "major",
    },
    verdict: "failure",
    reason: "wrong dye for fixed cells — Green FM is live-only, lost on fixation",
  },
];

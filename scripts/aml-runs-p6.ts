// scripts/aml-runs-p6.ts — run-specs for P6 "In vivo xenograft (MOLM-14-luc, NSG mice)".
// Each run becomes a started run → evidence → signed report → outcome → RAG + KG.
// Notes are the free text the AI reads to build the graph; keep them English and factual.
import type { RunSpec } from "./aml-common";

export const P6_RUNS: RunSpec[] = [
  // 1 ── engraftment cohort, clean take confirmed by BLI ~day 7 (success)
  {
    slug: "molm14luc-engraftment-baseline",
    date: "2024-06-24",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 0, treatment_days: 0, engraftment_days: 7 },
    notes: [
      "2024-06-24 · operator Emmanuel Djezvedjian. Opened the in vivo arm of the campaign: engraftment cohort of MOLM-14-luc (luciferase-tagged MOLM-14, heterozygous FLT3-ITD) injected IV via tail vein into NSG mice, 1 × 10^6 cells/mouse, n = 10.",
      "Followed the P6 engraftment step — serial bioluminescence imaging (IVIS Spectrum) after intraperitoneal D-luciferin — to track systemic leukaemic burden non-invasively.",
      "BLI signal rose above the engraftment threshold in all 10/10 mice by day 7: a clean, homogeneous take across the cohort with no obvious outliers.",
      "This engraftment-only run carries no drug (dose_mg_kg 0, treatment_days 0); it establishes the ~day-7 engraftment window every later xenograft run is timed against.",
      "Cohort qualifies for treatment randomization and seeds the quizartinib-vs-vehicle survival study.",
    ],
    measurement: { name: "Engraftment rate", value: 100, unit: "% engrafted" },
    verdict: "success",
  },

  // 2 ── quizartinib 10 mg/kg PO vs vehicle survival study (success)
  {
    slug: "quizartinib-10mgkg-vs-vehicle-survival",
    date: "2024-08-26",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 10, treatment_days: 28, engraftment_days: 7 },
    notes: [
      "2024-08-26 · operator Emmanuel Djezvedjian. Pivotal survival study: engrafted MOLM-14-luc NSG mice (cf. the 2024-06-24 engraftment cohort) randomized to quizartinib (AC220) 10 mg/kg PO once daily vs vehicle (22% HP-β-CD), n = 8 per arm.",
      "Dosing started day 7 post-engraftment, within the protocol's ≤ 7-day window, so tumour burden was still low at treatment start.",
      "Serial BLI: quizartinib suppressed leukaemic burden — signal fell over the first two weeks then held low — while the vehicle arm rose steeply and monotonically.",
      "Median survival ~45 days on quizartinib vs ~22 days on vehicle (log-rank p < 0.001): a large, on-target in vivo survival benefit over the 28-day treatment course.",
      "In vivo confirmation of the in vitro MOLM-14 sensitivity (quizartinib IC50 ~2 nM, cf. P2). Well tolerated at 10 mg/kg (stable body weight); consistent with 10.3390/jpm15100431.",
    ],
    measurement: { name: "Median survival (quizartinib 10 mg/kg)", value: 45, unit: "days" },
    verdict: "success",
  },

  // 3 ── dedicated vehicle control arm, rapid progression as expected (success)
  {
    slug: "vehicle-control-progression",
    date: "2024-10-28",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 0, treatment_days: 28, engraftment_days: 7 },
    notes: [
      "2024-10-28 · operator Emmanuel Djezvedjian. Dedicated vehicle-control arm: engrafted MOLM-14-luc NSG mice on vehicle (22% HP-β-CD) PO daily, no drug, n = 8 — the natural-history reference for the quizartinib survival benefit (dose_mg_kg 0).",
      "Purpose is to show the model behaves as an aggressive, uniformly lethal disease so treatment arms are read against a stable baseline.",
      "Serial BLI rose steeply and monotonically — rapid systemic progression, with hind-limb paralysis / moribund endpoints.",
      "Median survival ~22 days, matching the vehicle arm of the 2024-08-26 study (internal consistency across cohorts).",
      "Verdict success here means the control performed exactly as expected (rapid progression), validating the survival readout of the treated arms.",
    ],
    measurement: { name: "Median survival (vehicle)", value: 22, unit: "days" },
    verdict: "success",
  },

  // 4 ── poor/failed engraftment cohort, excluded (failure + deviation → engraftment threshold)
  {
    slug: "failed-engraftment-cohort-excluded",
    date: "2025-01-20",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 0, treatment_days: 0, engraftment_days: 7 },
    notes: [
      "2025-01-20 · operator Emmanuel Djezvedjian. Engraftment cohort of MOLM-14-luc injected IV into NSG mice (1 × 10^6 cells/mouse, n = 10), intended to feed a new treatment study.",
      "Unlike the clean 2024-06-24 take, BLI at the ~day-7 checkpoint was low or absent in most animals — only 3/10 (30%) crossed the engraftment threshold, and the signal never consolidated on re-imaging.",
      "Probable cause: a low-viability injection prep (post-thaw MOLM-14-luc viability had dropped below spec) compounded by likely partial IV mis-injection.",
      "This breaches the P6 rule to exclude cohorts with poor/failed engraftment: a 30% take cannot support a treatment readout, so the cohort was excluded and no dosing was started.",
      "Corrective action: re-thaw a fresh, high-viability MOLM-14-luc stock, confirm > 90% viability at the moment of injection, and re-run engraftment before opening any treatment arm.",
    ],
    measurement: { name: "Engraftment rate", value: 30, unit: "% engrafted" },
    deviation: {
      expected: "≥ 80% of the cohort BLI-confirmed above the engraftment threshold by ~day 7",
      actual: "only 30% (3/10) engrafted, BLI below threshold",
      reason: "low-viability injection prep / failed IV take",
      severity: "major",
    },
    verdict: "failure",
    reason: "poor/failed engraftment — cohort below threshold, excluded (cannot support a treatment readout)",
  },

  // 5 ── in vivo dose-response 5/10/30 mg/kg, non-linear + tolerability-limited (partial)
  {
    slug: "quizartinib-invivo-dose-response",
    date: "2025-03-24",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 30, treatment_days: 28, engraftment_days: 7 },
    notes: [
      "2025-03-24 · operator Emmanuel Djezvedjian. In vivo quizartinib (AC220) dose-response in engrafted MOLM-14-luc NSG mice: 5, 10 and 30 mg/kg PO daily vs vehicle, n = 8 per arm, to map the dose-benefit curve.",
      "Dosing began day 7 post-engraftment (within window); tumour burden tracked by serial BLI with median survival as the endpoint.",
      "Median survival ~30 days at 5 mg/kg, ~45 days at 10 mg/kg and ~50 days at 30 mg/kg (vehicle ~22 days, cf. the 2024-10-28 control).",
      "5 mg/kg was largely sub-therapeutic — only marginally above vehicle — so the low end does not deliver a durable benefit.",
      "30 mg/kg added little survival over 10 mg/kg (a plateau) but carried a tolerability signal (~10% body-weight loss, reduced activity), so the top dose is not cleanly better.",
      "Net: dose-dependent but non-linear and tolerability-limited — a partial result. 10 mg/kg remains the therapeutic sweet spot, consistent with the 2024-08-26 survival study.",
    ],
    measurement: { name: "Median survival (30 mg/kg)", value: 50, unit: "days" },
    verdict: "partial",
    reason: "non-linear, tolerability-limited dose-response — 5 mg/kg sub-therapeutic, 30 mg/kg plateau with weight loss",
  },

  // 6 ── relapse on continued quizartinib = in vivo resistance, ties to P5 TKD mutations (failure + deviation)
  {
    slug: "relapse-on-treatment-invivo-resistance",
    date: "2025-06-16",
    cellLine: "MOLM-14-luc (luciferase-tagged, heterozygous FLT3-ITD)",
    params: { dose_mg_kg: 10, treatment_days: 53, engraftment_days: 7 },
    notes: [
      "2025-06-16 · operator Emmanuel Djezvedjian. Extended-dosing xenograft: engrafted MOLM-14-luc NSG mice on quizartinib (AC220) 10 mg/kg PO daily, followed well past the usual window to test durability of response, n = 8 (dosed ~53 days, to ~day 60 post-engraftment).",
      "The initial response reproduced the 2024-08-26 result — BLI fell over the first ~3 weeks and leukaemic burden stayed low.",
      "From ~day 40 tumour burden rebounded while the mice were still on quizartinib: BLI climbed ~8-fold off nadir — an unambiguous relapse on treatment, i.e. in vivo resistance.",
      "This maps to the P6 ⚠️ threshold (tumour regrowth under continued quizartinib = in vivo resistance): relapsed tumours were harvested and the FLT3 TKD was genotyped.",
      "Sequencing recovered the P5 mechanism — secondary FLT3-TKD D835Y and F691L (gatekeeper) mutations — the same escape route as the in vitro MOLM-14-QuizR subline (cf. biorxiv-2022.04.15.488522).",
      "Consistent with the cross-resistance payoff: gilteritinib (ASP2215) and crenolanib retain activity on D835Y/F691L and are the rational salvage. Verdict failure = the treatment goal (durable control) was lost to acquired resistance.",
    ],
    measurement: { name: "BLI fold-increase at relapse", value: 8, unit: "fold" },
    deviation: {
      expected: "durable tumour suppression with no regrowth on continued quizartinib",
      actual: "BLI rebounded ~8-fold from nadir while on 10 mg/kg quizartinib (relapse on treatment)",
      reason: "acquired FLT3-TKD resistance (D835Y / F691L)",
      severity: "major",
    },
    verdict: "failure",
    reason: "acquired in vivo resistance — relapse on quizartinib via secondary FLT3-TKD D835Y/F691L (cf. P5)",
  },
];

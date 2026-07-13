// scripts/demo-runs-d2.ts — run inventory for demo Protocol D2
// "Clonogenic colony-forming (CFU) assay in methylcellulose (± TKI)".
// Each RunSpec is the free-text material the pipeline turns into a signed report
// and the AI turns into the knowledge graph (reagents, cell lines, parameter
// values, failure modes). The `result` field feeds the report's Result section —
// set on every run EXCEPT the two prep failures (5, 6), which demo the empty
// "Results" state. Param keys (numbers only): seeding_density_cfu (cells/dish),
// drug_concentration (nM, TKI), incubation_days (days), colony_threshold (cells,
// = 50). Primary metric = CFU% (colonies / cells plated). Hubs with the AML set:
// MOLM-14, MV4-11, THP-1, MOLM-14-QuizR, quizartinib (AC220), gilteritinib
// (ASP2215), FLT3-ITD, D835Y; naïve quizartinib IC50 ~2 nM on MOLM-14.
import type { RunSpec } from "./aml-common";

export const D2_RUNS: RunSpec[] = [
  // 1 ── 2024-02-12 · MOLM-14 · baseline CFU, no drug · success · CFU% ~40%
  {
    slug: "cfu-baseline-molm14-no-drug",
    date: "2024-02-12",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 0, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-02-12 · operator Emmanuel Djezvedjian. Baseline clonogenic (CFU) assay: MOLM-14 (heterozygous FLT3-ITD) single-cell suspension plated at 500 cells/dish in cytokine-supplemented MethoCult methylcellulose, no drug (DMSO vehicle only), cultured 12 days at 37 °C / 5% CO2 with a water-reservoir dish.",
      "Trypan-blue count confirmed a true single-cell prep with no aggregates; gridded 35 mm dishes were scored blinded on the Olympus CKX53, counting aggregates of > 50 cells as one colony.",
      "~200 colonies grew from 500 cells plated → CFU% ~40%, establishing the vehicle clonogenic frequency for MOLM-14.",
      "This is the reference no-drug baseline for the quizartinib CFU-suppression run (cf. 2024-03-25) and for the cross-line comparisons with MV4-11 (cf. 2024-05-13) and THP-1 (cf. 2024-06-24).",
      "No deviations; complements the bulk-viability IC50 (naïve quizartinib MOLM-14 ~2 nM) with a stem/progenitor-like self-renewal endpoint.",
    ],
    measurement: { name: "CFU%", value: 40, unit: "%" },
    result: {
      note: "MOLM-14 forms colonies at ~40% CFU without drug — the vehicle clonogenic baseline for every TKI comparison in this protocol.",
      measurement: { name: "CFU%", value: 40, unit: "%" },
    },
    verdict: "success",
  },

  // 2 ── 2024-03-25 · MOLM-14 · + quizartinib 10 nM · success · CFU% ~8% (on-target)
  {
    slug: "cfu-molm14-quizartinib-10nm",
    date: "2024-03-25",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 10, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-03-25 · operator Emmanuel Djezvedjian. Clonogenic (CFU) assay: MOLM-14 (heterozygous FLT3-ITD) plated at 500 cells/dish in cytokine-supplemented MethoCult with quizartinib (AC220) 10 nM (DMSO ≤ 0.1%), 12 days, with a paired vehicle arm.",
      "Quizartinib 10 nM sits ~5× above the naïve bulk IC50 (~2 nM on MOLM-14) — a saturating clonogenic dose for an FLT3-ITD-addicted line.",
      "Colony counts collapsed versus the vehicle arm: CFU% fell to ~8% against the ~40% no-drug baseline (cf. 2024-02-12), i.e. roughly 80% suppression of clonogenicity.",
      "On-target: FLT3-ITD signalling drives MOLM-14 self-renewal, so a selective FLT3 TKI suppresses colony formation. Contrast with the FLT3-WT THP-1 specificity control (cf. 2024-06-24).",
      "No deviations; single-cell prep clean, DMSO held at 0.1%.",
    ],
    measurement: { name: "CFU%", value: 8, unit: "%" },
    result: {
      note: "Quizartinib 10 nM suppresses MOLM-14 clonogenicity to ~8% CFU (from ~40% vehicle) — on-target FLT3-ITD dependence at the self-renewal level.",
      measurement: { name: "CFU%", value: 8, unit: "%" },
    },
    verdict: "success",
  },

  // 3 ── 2024-05-13 · MV4-11 · + quizartinib 10 nM · success · CFU% ~5% (most FLT3-addicted)
  {
    slug: "cfu-mv411-quizartinib-10nm",
    date: "2024-05-13",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 10, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-05-13 · operator Emmanuel Djezvedjian. Clonogenic (CFU) assay: MV4-11 (homozygous FLT3-ITD) plated at 500 cells/dish in cytokine-supplemented MethoCult with quizartinib (AC220) 10 nM (DMSO ≤ 0.1%), 12 days, with a paired vehicle arm.",
      "MV4-11 is homozygous for FLT3-ITD and the most FLT3-addicted line of the panel (naïve quizartinib IC50 ~1 nM), so 10 nM is deeply saturating.",
      "Strongest suppression of the panel: CFU% fell to ~5% versus its vehicle arm, deeper than the heterozygous MOLM-14 quizartinib response (~8%, cf. 2024-03-25).",
      "Confirms that clonogenic FLT3 dependence scales with ITD allelic burden — homozygous MV4-11 > heterozygous MOLM-14 ≫ FLT3-WT THP-1 (cf. 2024-06-24).",
      "No deviations; clean single-cell prep, colonies scored blinded at > 50 cells.",
    ],
    measurement: { name: "CFU%", value: 5, unit: "%" },
    result: {
      note: "MV4-11 (homozygous FLT3-ITD) is the most quizartinib-sensitive clonogenically — CFU% ~5% at 10 nM, the strongest suppression in the panel.",
      measurement: { name: "CFU%", value: 5, unit: "%" },
    },
    verdict: "success",
  },

  // 4 ── 2024-06-24 · THP-1 (FLT3-WT) · + quizartinib 10 nM · success · CFU% ~35% (specificity control)
  {
    slug: "cfu-thp1-quizartinib-specificity-control",
    date: "2024-06-24",
    cellLine: "THP-1 (FLT3-WT)",
    params: { seeding_density_cfu: 500, drug_concentration: 10, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-06-24 · operator Emmanuel Djezvedjian. Clonogenic (CFU) assay: THP-1 (FLT3-WT specificity control) plated at 500 cells/dish in cytokine-supplemented MethoCult with quizartinib (AC220) 10 nM (DMSO ≤ 0.1%), 12 days, with a paired vehicle arm.",
      "THP-1 lacks FLT3-ITD (quizartinib IC50 ≫ µM), so 10 nM is far below any on-target effect — the negative-control cell line for FLT3 selectivity.",
      "Colonies were essentially spared: CFU% ~35% with quizartinib versus ~38% vehicle, i.e. negligible suppression.",
      "Specificity confirmed: quizartinib suppresses clonogenicity in the FLT3-ITD lines (MOLM-14 ~8%, MV4-11 ~5%; cf. 2024-03-25 / 2024-05-13) but spares FLT3-WT THP-1 — the effect is on-target, not general cytotoxicity.",
      "No deviations; single-cell prep clean, DMSO ≤ 0.1%.",
    ],
    measurement: { name: "CFU%", value: 35, unit: "%" },
    result: {
      note: "Quizartinib 10 nM spares FLT3-WT THP-1 colonies (CFU% ~35% vs ~38% vehicle) — the on-target specificity control for the FLT3-ITD suppression seen in MOLM-14/MV4-11.",
      measurement: { name: "CFU%", value: 35, unit: "%" },
    },
    verdict: "success",
  },

  // 5 ── 2024-08-12 · MOLM-14 · cell clumping → pseudo-colonies · FAILURE · Results LEFT EMPTY
  {
    slug: "cfu-molm14-clumping-pseudocolonies",
    date: "2024-08-12",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 0, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-08-12 · operator Emmanuel Djezvedjian. MOLM-14 (heterozygous FLT3-ITD) vehicle clonogenic (CFU) repeat ruined by cell clumping — the suspension was not fully dissociated, so aggregates were plated instead of single cells.",
      "The trypan-blue single-cell check was skipped in haste; visible clumps went into the MethoCult and seeded pseudo-colonies (aggregate outgrowth) rather than true single-cell-derived colonies.",
      "Apparent counts were nonsensically high (~85% apparent CFU, well above the ~40% single-cell baseline, cf. 2024-02-12) — a classic aggregate artifact — so the plate could not be scored.",
      "Corrective action: filter/triturate to a verified single-cell suspension (cell strainer + trypan-blue count) before plating, then re-run the baseline.",
      "Plate excluded — no valid CFU% recorded.",
    ],
    measurement: { name: "Apparent CFU% (aggregate-inflated, invalid)", value: 85, unit: "%" },
    deviation: {
      expected: "verified single-cell suspension (no aggregates)",
      actual: "clumped suspension plated → aggregate pseudo-colonies",
      reason: "cell clumping seeded pseudo-colonies, not single-cell-derived colonies",
      severity: "major",
    },
    verdict: "failure",
    reason: "cell clumping → pseudo-colonies; not a single-cell prep, plate uncountable and excluded",
  },

  // 6 ── 2024-09-23 · MOLM-14 · too-high plating density → merged colonies · FAILURE · Results LEFT EMPTY
  {
    slug: "cfu-molm14-density-merged-colonies",
    date: "2024-09-23",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 5000, drug_concentration: 0, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-09-23 · operator Emmanuel Djezvedjian. MOLM-14 (heterozygous FLT3-ITD) vehicle clonogenic (CFU) run plated at 5000 cells/dish — 10× above the ~500 cells/dish linear range — so the colonies grew into one another.",
      "At this density colonies merged into confluent sheets that could not be resolved as discrete > 50-cell aggregates; the plate was uncountable.",
      "Plating density sat above the linear range where CFU% is proportional to cells plated, so no reliable clonogenic frequency could be derived (cf. the 500 cells/dish baseline, 2024-02-12).",
      "Corrective action: return to 500–1000 cells/dish inside the linear range and re-plate; titrate density if needed.",
      "Plate excluded — no valid CFU% recorded.",
    ],
    measurement: { name: "Countable dishes", value: 0, unit: "%" },
    deviation: {
      expected: "plating density in the linear range (~500 cells/dish)",
      actual: "5000 cells/dish → merged, confluent colonies",
      reason: "plating density above the linear range — colonies merged and could not be scored",
      severity: "major",
    },
    verdict: "failure",
    reason: "too-high plating density above the linear range → merged colonies, uncountable plate excluded",
  },

  // 7 ── 2024-11-18 · MOLM-14-QuizR · quizartinib retained, gilteritinib 30 nM suppresses · success (cross-resistance)
  {
    slug: "cfu-molm14-quizr-gilteritinib-crossresistance",
    date: "2024-11-18",
    cellLine: "MOLM-14-QuizR (quizartinib-resistant subline, FLT3-ITD + D835Y)",
    params: { seeding_density_cfu: 500, drug_concentration: 30, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2024-11-18 · operator Emmanuel Djezvedjian. Clonogenic (CFU) assay on MOLM-14-QuizR (quizartinib-resistant subline carrying the D835Y kinase-domain mutation): three arms — vehicle, quizartinib (AC220) 10 nM, and gilteritinib (ASP2215) 30 nM — plated at 500 cells/dish in MethoCult, 12 days.",
      "Quizartinib 10 nM (saturating on parental MOLM-14) barely dented colonies here: CFU% ~38% versus ~40% vehicle — clonogenic resistance, consistent with the D835Y activation-loop mutation that blocks type-II quizartinib binding.",
      "Gilteritinib 30 nM, a type-I FLT3 inhibitor that retains activity against D835Y, suppressed colonies to ~10% CFU — cross-resistance is drug-specific, not a loss of FLT3 dependence.",
      "Documents the resistance mechanism at the self-renewal level: MOLM-14-QuizR stays FLT3-addicted but escapes quizartinib via D835Y, while gilteritinib retains clonogenic activity (cf. the parental quizartinib response, 2024-03-25).",
      "No deviations; clean single-cell prep, DMSO ≤ 0.1%. Headline metric is the gilteritinib CFU% (the on-target rescue arm).",
    ],
    measurement: { name: "CFU% (gilteritinib 30 nM)", value: 10, unit: "%" },
    result: {
      note: "MOLM-14-QuizR resists quizartinib clonogenically (CFU ~38%, D835Y) but gilteritinib 30 nM retains activity and suppresses colonies to ~10% CFU — drug-specific cross-resistance with FLT3 dependence intact.",
      measurement: { name: "CFU% (gilteritinib 30 nM)", value: 10, unit: "%" },
    },
    verdict: "success",
  },

  // 8 ── 2025-01-20 · MOLM-14 · evaporation over 14 d → dried gel · FAILURE (result note on failed plate)
  {
    slug: "cfu-molm14-evaporation-dried-gel",
    date: "2025-01-20",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 10, incubation_days: 14, colony_threshold: 50 },
    notes: [
      "2025-01-20 · operator Emmanuel Djezvedjian. MOLM-14 (heterozygous FLT3-ITD) ± quizartinib (AC220) 10 nM clonogenic run cultured to 14 days without a water-reservoir dish — the methylcellulose dried out.",
      "Over the two-week culture the gel lost water, cracked at the edges and contracted; developing colonies desiccated and were lost across both the vehicle and drug arms.",
      "No reliable colonies remained to score (recovered CFU ~2%, essentially all dried/dead), so the plate carries no interpretable clonogenic frequency.",
      "Corrective action: always include a humidified water-reservoir dish in the plate tray and do not disturb during the 10–14 day culture; re-run.",
      "Plate excluded from the CFU analysis.",
    ],
    measurement: { name: "CFU% (plate dried, void)", value: 2, unit: "%" },
    deviation: {
      expected: "humidified culture with a water-reservoir dish over 10–14 days",
      actual: "no reservoir → methylcellulose dried out at 14 days, colonies lost",
      reason: "evaporation over the 14-day culture desiccated the gel",
      severity: "critical",
    },
    result: {
      note: "Plate failed and was excluded: with no water reservoir the methylcellulose dried out by day 14 and the colonies desiccated — no valid CFU% (only ~2% recovered). Re-run with a reservoir dish.",
    },
    verdict: "failure",
    reason: "evaporation over 14 days dried the methylcellulose gel — colonies lost, plate excluded",
  },

  // 9 ── 2025-03-17 · MOLM-14 · scoring threshold mis-set (< 50-cell clusters counted) · partial
  {
    slug: "cfu-molm14-scoring-threshold-misset",
    date: "2025-03-17",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 0, incubation_days: 12, colony_threshold: 20 },
    notes: [
      "2025-03-17 · operator Emmanuel Djezvedjian. MOLM-14 (heterozygous FLT3-ITD) vehicle clonogenic (CFU) run scored with a mis-set colony threshold — small < 50-cell clusters were counted as colonies (effective threshold ~20 cells instead of the > 50-cell standard).",
      "Counting sub-threshold clusters inflated the apparent clonogenic frequency: CFU% read ~65% against the true ~40% single-cell baseline (cf. 2024-02-12).",
      "The error is a scoring-definition mistake, not a change in biology — many of the extra 'colonies' were 20–50-cell clusters that should not qualify.",
      "Re-scoring blinded at the > 50-cell threshold recovered CFU% ~40%, back in line with the baseline — so the run is salvageable, hence partial rather than a full failure.",
      "Corrective action: lock the colony definition (> 50 cells) into the scoring SOP and score blinded; treat the > 50-cell re-score as the reportable value.",
    ],
    measurement: { name: "Inflated CFU% (threshold ~20 cells)", value: 65, unit: "%" },
    deviation: {
      expected: "colony = aggregate of > 50 cells (colony_threshold 50)",
      actual: "counted < 50-cell clusters (effective threshold ~20 cells)",
      reason: "colony scoring threshold mis-set below the > 50-cell definition",
      severity: "minor",
    },
    result: {
      note: "A mis-set scoring threshold inflated CFU% to ~65% by counting < 50-cell clusters; re-scoring at the > 50-cell definition recovers the ~40% baseline — partial, salvageable by re-scoring.",
      measurement: { name: "CFU% (re-scored at > 50 cells)", value: 40, unit: "%" },
    },
    verdict: "partial",
    reason: "colony scoring threshold mis-set (< 50-cell clusters counted) inflated CFU%; recoverable by re-scoring at > 50 cells",
  },

  // 10 ── 2025-06-16 · MOLM-14 · gilteritinib CFU dose-response (0/5/15/30 nM) · partial (plate-to-plate variability)
  {
    slug: "cfu-molm14-gilteritinib-dose-response",
    date: "2025-06-16",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density_cfu: 500, drug_concentration: 30, incubation_days: 12, colony_threshold: 50 },
    notes: [
      "2025-06-16 · operator Emmanuel Djezvedjian. Gilteritinib (ASP2215) clonogenic dose-response on MOLM-14 (heterozygous FLT3-ITD): four arms at 0 / 5 / 15 / 30 nM, plated at 500 cells/dish in MethoCult, 12 days, DMSO ≤ 0.1%.",
      "CFU% fell with dose — ~40% (0 nM) → ~28% (5 nM) → ~18% (15 nM, near the ~15 nM bulk IC50) → ~9% (30 nM) — a clear dose-dependent suppression of clonogenicity.",
      "Direction and top-dose effect are convincing and agree with the quizartinib on-target result (cf. 2024-03-25) and the QuizR gilteritinib rescue (cf. 2024-11-18).",
      "However the mid-dose points (5 and 15 nM) showed appreciable plate-to-plate variability (CV ~25%) across the triplicate dishes, so the fitted curve is noisy and a precise clonogenic IC50 could not be pinned down.",
      "Partial: the dose-response trend is real but the between-plate scatter needs more replicate dishes before quoting an IC50. Headline is the 30 nM CFU%.",
    ],
    measurement: { name: "CFU% (gilteritinib 30 nM)", value: 9, unit: "%" },
    result: {
      note: "Gilteritinib suppresses MOLM-14 clonogenicity dose-dependently (CFU% ~40 → 9% across 0–30 nM) but mid-dose plate-to-plate variability (CV ~25%) blocks a precise IC50 — partial, needs more replicates.",
      measurement: { name: "CFU% (gilteritinib 30 nM)", value: 9, unit: "%" },
    },
    verdict: "partial",
    reason: "dose-dependent CFU suppression confirmed but plate-to-plate variability (CV ~25%) at mid doses prevents a precise clonogenic IC50",
  },
];

// scripts/aml-runs-p1.ts — run inventory for Protocol P1
// "AML cell line culture & FLT3-ITD characterization".
// Each RunSpec is distilled from the rich English report in
// .context/aml-kg-notebook/experiments/ — same date, cell line, verdict and
// primary metric. Param keys (numbers only): seeding_density (cells/mL),
// max_density (cells/mL), passage_number (passage), viability (% viability).
import type { RunSpec } from "./aml-common";

export const P1_RUNS: RunSpec[] = [
  // 1 ── 2021-02-15 · MOLM-14 thaw & establish · success · viability 94%
  {
    slug: "molm14-thaw-establish",
    date: "2021-02-15",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density: 400000, max_density: 2000000, passage_number: 3, viability: 94 },
    notes: [
      "2021-02-15 · operator Emmanuel Djezvedjian. Thawed one cryovial of MOLM-14 (heterozygous FLT3-ITD) from the master bank (passage 2) and established the working stock (p3) in RPMI-1640 + 10% FBS + 1% Pen/Strep/L-Glut — the project's primary FLT3-ITD model.",
      "Rapid 37 °C thaw (~90 s), diluted dropwise into 9 mL pre-warmed complete medium, spun 300 × g / 5 min to remove DMSO, then seeded at 4 × 10^5 cells/mL in a T75 (Countess II FL, trypan blue counts).",
      "Recovery was clean: viability 88% post-thaw → 92% at 24 h → 94% at 48 h, with a ~24 h doubling time and no debris or aggregation.",
      "MOLM-14 keeps one wild-type and one ITD FLT3 allele, anchoring the 'FLT3-addicted but heterozygous' middle of the panel between homozygous MV4-11 and wild-type THP-1.",
      "No deviations — density stayed well under the 2 × 10^6 cells/mL ceiling. Released to expansion and the STR + FLT3-ITD PCR + mycoplasma QC checkpoint (cf. 2021-05-24) before any pharmacology.",
    ],
    measurement: { name: "Viability", value: 94, unit: "% viability" },
    verdict: "success",
  },

  // 2 ── 2021-02-22 · MV4-11 thaw & establish · success · viability 91%
  {
    slug: "mv4-11-thaw-establish",
    date: "2021-02-22",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { seeding_density: 350000, max_density: 2000000, passage_number: 4, viability: 91 },
    notes: [
      "2021-02-22 · operator Emmanuel Djezvedjian. Thawed MV4-11 (homozygous FLT3-ITD, master-bank passage 3) and established the working stock (p4) in RPMI-1640 + 10% FBS — the most FLT3-addicted line in the panel.",
      "Seeded at 3.5 × 10^5 cells/mL in a T75 after DMSO removal; counted at 0/24/48/72 h on the Countess II FL.",
      "Slower re-entry than MOLM-14 (cf. the 2021-02-15 thaw): viability 84% post-thaw → 89% at 48 h → 91% at 72 h, doubling ~30 h — expected for this line, not a health issue.",
      "With homozygous ITD and no wild-type FLT3 allele, MV4-11 marks the maximally FLT3-dependent extreme and should give the lowest TKI IC50 of the three lines.",
      "No deviations. Homozygous ITD (absence of a wild-type band) to be confirmed at the FLT3-ITD PCR QC step (2021-05-24); expanded and banked at early passage first.",
    ],
    measurement: { name: "Viability", value: 91, unit: "% viability" },
    verdict: "success",
  },

  // 3 ── 2021-03-01 · THP-1 thaw (wild-type control) · success · viability 96%
  {
    slug: "thp-1-thaw-control",
    date: "2021-03-01",
    cellLine: "THP-1 (FLT3 wild-type)",
    params: { seeding_density: 400000, max_density: 2000000, passage_number: 6, viability: 96 },
    notes: [
      "2021-03-01 · operator Emmanuel Djezvedjian. Thawed THP-1 (FLT3 wild-type, master-bank passage 5) and established the working stock (p6) in RPMI-1640 + 10% FBS supplemented with 50 µM 2-mercaptoethanol — the on-target negative control for the whole project.",
      "Seeded at 4 × 10^5 cells/mL after DMSO removal; counted at 0/24/48 h (Countess II FL, trypan blue).",
      "Fastest, cleanest recovery of the three lines: viability 90% post-thaw → 94% at 24 h → 96% at 48 h, uniform monocytoid blasts, no adherent fraction under suspension.",
      "THP-1 does not depend on constitutively active FLT3, so any FLT3-selective TKI that kills MOLM-14/MV4-11 but spares THP-1 is acting on target — this line is the specificity linchpin.",
      "No deviations. FLT3 wild-type status to be reconfirmed by PCR at QC (2021-05-24); reserved as the paired control in every dose-response plate (P2).",
    ],
    measurement: { name: "Viability", value: 96, unit: "% viability" },
    verdict: "success",
  },

  // 4 ── 2021-03-29 · MOLM-14 over-confluence · failure · viability 46% (density breach)
  {
    slug: "molm14-overconfluence-failure",
    date: "2021-03-29",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density: 500000, max_density: 2500000, passage_number: 9, viability: 46 },
    notes: [
      "2021-03-29 · operator Emmanuel Djezvedjian. Routine expansion of the MOLM-14 (heterozygous FLT3-ITD) working stock (p9) for the upcoming FLT3-inhibitor dose-response campaign — recorded here as an unplanned over-confluence deviation and root-cause analysis.",
      "Seeded 2021-03-26 at 5 × 10^5 cells/mL; the scheduled day-2/day-3 split was missed because a public holiday on 2021-03-29 was not flagged in the split schedule.",
      "On day 3 the medium was visibly yellow/acidic; Countess II FL counts (two replicates) gave 2.5 × 10^6 cells/mL total at ~46% viability — dense, clumped, debris-laden, few refractile blasts.",
      "Density breached the 2 × 10^6 cells/mL critical ceiling (~2.5× the 1 × 10^6 maintenance target): over-confluence exhausted glucose/glutamine and accumulated lactate, acidifying the medium and collapsing viability.",
      "This was neither reagent nor contamination — the same FBS/RPMI lots ran nominally on 2021-02-15 and 2021-06-21 and the line was mycoplasma-negative; the single deviating factor was density. Root cause is a scheduling gap, not technique.",
      "Corrective actions: discarded the flask and re-thawed MOLM-14 from an early-passage bank vial; added a rule to seed lower (2–3 × 10^5 cells/mL) across holiday gaps and to log density on every passage.",
    ],
    measurement: { name: "Viability", value: 46, unit: "% viability" },
    deviation: {
      expected: "density ≤ 2 × 10^6 cells/mL",
      actual: "2.5 × 10^6 cells/mL (split missed over a holiday)",
      reason: "missed split → over-confluence and medium acidification",
      severity: "major",
    },
    verdict: "failure",
    reason: "over-confluence after a missed split: density breached 2 × 10^6 cells/mL, medium acidified, viability collapsed to 46%",
  },

  // 5 ── 2021-04-19 · MV4-11 mycoplasma · failure · MycoAlert ratio 1.96 (contamination)
  {
    slug: "mv4-11-mycoplasma-failure",
    date: "2021-04-19",
    cellLine: "MV4-11 (homozygous FLT3-ITD)",
    params: { seeding_density: 400000, max_density: 2000000, passage_number: 11 },
    notes: [
      "2021-04-19 · operator Emmanuel Djezvedjian. Investigated two passages of erratic, sluggish growth in the MV4-11 (homozygous FLT3-ITD) working stock by MycoAlert luminescence — the culture proved mycoplasma-positive and was quarantined and discarded.",
      "Collected 2 mL cleared supernatant and ran the two-reading MycoAlert protocol (Reading A baseline ATP, Reading B after substrate) alongside kit positive/negative controls on the GloMax Discover.",
      "MycoAlert ratio (B/A) = 1.96 against a positivity threshold of 1.2 (negative control 1.04, positive control 2.20) — an unambiguous mycoplasma-positive call; no viability/growth metric applies once the culture is invalidated.",
      "Cells looked grossly normal under the CKX53, matching the classic 'looks fine but behaves oddly' mycoplasma pattern: the organisms compete for nutrients and perturb signalling/metabolism, which would confound any TKI dose-response run on this stock.",
      "Root cause was an undetermined introduction (handling or a shared reagent). Corrective actions: discarded the flask and all derived plates/aliquots, decontaminated the cabinet and incubator shelf, and re-thawed MV4-11 from a clean early-passage bank vial (later confirmed negative at the 2021-05-24 QC).",
      "Policy tightened to test mycoplasma on every new thaw and monthly on active stocks, not only at banking.",
    ],
    measurement: { name: "MycoAlert ratio", value: 1.96, unit: "ratio" },
    deviation: {
      expected: "mycoplasma-negative (MycoAlert ratio ≤ 1.2)",
      actual: "MycoAlert ratio 1.96 (positive)",
      reason: "mycoplasma contamination introduced during handling or via a shared reagent",
      severity: "critical",
    },
    verdict: "failure",
    reason: "mycoplasma contamination (MycoAlert ratio 1.96 > 1.2) — culture and all derived material discarded",
  },

  // 6 ── 2021-05-24 · Panel QC (STR + FLT3-ITD PCR + mycoplasma) · success
  {
    slug: "panel-qc-str-flt3-mycoplasma",
    date: "2021-05-24",
    cellLine: "MOLM-14, MV4-11 and THP-1 (three-line AML panel)",
    params: { passage_number: 10 },
    notes: [
      "2021-05-24 · operator Emmanuel Djezvedjian. Authentication checkpoint for the three early-passage working stocks — MOLM-14, MV4-11 and THP-1 — by STR profiling (GenePrint 10), FLT3-ITD PCR (exon 14/15) and MycoAlert, before releasing any of them to pharmacology.",
      "STR vs reference: MOLM-14 9/9 (100%), MV4-11 9/9 (100%), THP-1 8/9 (94%, one partial locus) — all above the 80% concordance threshold, so all three authenticate as matches.",
      "FLT3-ITD PCR confirmed the intended zygosity gradient: MOLM-14 heterozygous (wild-type + ITD amplicon), MV4-11 homozygous (ITD only, no wild-type band), THP-1 FLT3 wild-type.",
      "MycoAlert on fresh supernatants was negative for all three (MOLM-14 1.03, MV4-11 1.01, THP-1 1.05; all < 1.2); the re-thawed MV4-11 that had failed on 2021-04-19 is confirmed clean here.",
      "The wild-type → heterozygous → homozygous axis (THP-1 ≪ MOLM-14 < MV4-11) is exactly what the campaign exploits: TKI sensitivity is predicted to track ITD dosage. All three lines released to the FLT3-inhibitor dose-response campaign (P2).",
    ],
    measurement: { name: "STR concordance", value: 100, unit: "%" },
    verdict: "success",
  },

  // 7 ── 2021-06-21 · MOLM-14 passage p12 growth curve · success · viability 95%
  {
    slug: "molm14-passage-growthcurve",
    date: "2021-06-21",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density: 500000, max_density: 2000000, passage_number: 12, viability: 95 },
    notes: [
      "2021-06-21 · operator Emmanuel Djezvedjian. Routine passage and growth-curve check of MOLM-14 (heterozygous FLT3-ITD) at p12, immediately before the FLT3-inhibitor dose-response campaign, and the first passage on a new RPMI-1640 lot (2151090) — an implicit lot check.",
      "Pre-split culture was 9.6 × 10^5 cells/mL at 94% viability (top of the target band); split to 5 × 10^5 cells/mL in 20 mL fresh complete medium (T75).",
      "Short growth curve on the new lot: 5.0 → 8.0 → 10.0 × 10^5 cells/mL over 0/24/48 h, doubling ~25 h, viability 95%, clean morphology and no debris.",
      "The new RPMI lot performed identically to the previous one (overlapping growth curves, no lot effect) — the kind of small control that stops a silent reagent change being mistaken for biology later.",
      "No deviations; passage 12 (≤ 20) and density kept under the ceiling. This log-phase stock is release-ready to seed the first quizartinib/gilteritinib dose-response plates (cf. the 2021-02-15 baseline establishment).",
    ],
    measurement: { name: "Viability", value: 95, unit: "% viability" },
    verdict: "success",
  },

  // 8 ── 2021-07-26 · MOLM-14 late-passage drift p28 · partial · viability 88%, surface FLT3 −38%
  {
    slug: "molm14-passage-drift-partial",
    date: "2021-07-26",
    cellLine: "MOLM-14 (heterozygous FLT3-ITD)",
    params: { seeding_density: 500000, max_density: 2000000, passage_number: 28, viability: 88 },
    notes: [
      "2021-07-26 · operator Emmanuel Djezvedjian. Late-passage drift check of MOLM-14 (heterozygous FLT3-ITD) carried to p28 — beyond the protocol's ~25 ceiling — testing whether it is still fit for quantitative pharmacology against an early-passage p12 reference.",
      "Cultured MOLM-14 continuously to p28, thawed a paired p12 reference (cf. 2021-06-21), and compared 48 h growth plus surface FLT3/CD135 by CD135-PE staining on the FACSCanto II.",
      "p28 had drifted: doubling time ~34 h vs ~25 h for p12, and 48 h viability 88% vs 95% — alive and still acceptable on viability alone.",
      "Critically, surface FLT3 fell 38% (CD135 MFI 3,010 vs 4,850 at p12); because the campaign's TKI dose-response depends on FLT3 abundance, a drifted culture would look artificially less FLT3-dependent and systematically distort IC50 comparisons.",
      "Verdict partial — the cells are not dead but are unfit for the intended quantitative use. Root cause is passage accumulation beyond ~25, consistent with the known instability of AML lines.",
      "Corrective actions: retired the p28 stock from pharmacology, reverted to an early-passage vial, capped all working stocks at passage 20, and added periodic CD135/FLT3 MFI spot-checks as an early drift warning.",
    ],
    measurement: { name: "Viability", value: 88, unit: "% viability" },
    deviation: {
      expected: "working-stock passage ≤ 20 (≤ ~25 ceiling)",
      actual: "passage 28",
      reason: "passage accumulation → late-passage drift (slower growth, −38% surface FLT3)",
      severity: "minor",
    },
    verdict: "partial",
    reason: "late-passage drift at p28 (> 20): −38% surface FLT3 and ~35% slower growth make the stock unfit for quantitative pharmacology",
  },
];

// scripts/aml-protocols.ts — the 6 AML/FLT3 protocol drafts (English).
// Materials become reagent nodes; cell lines named in prose become cell_line
// nodes; ⚠️ step thresholds become failure_mode nodes; parameters become
// parameter_type nodes; sources become publication nodes (cites). All English.
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";

// P1 ──────────────────────────────────────────────────────────────────────
const P1_DRAFT: ProtocolDraft = {
  title: "AML cell line culture & FLT3-ITD characterization",
  summary:
    "Establish, maintain and authenticate the three-line AML panel: MOLM-14 (heterozygous FLT3-ITD, primary model), MV4-11 (homozygous FLT3-ITD, most FLT3-addicted) and THP-1 (FLT3 wild-type, on-target control). Suspension culture in RPMI-1640 + 10% FBS, banking, and a QC checkpoint (STR + FLT3-ITD PCR + mycoplasma) before any pharmacology.",
  materials: [
    { name: "RPMI-1640 (+L-glutamine)", role: "reagent" },
    { name: "Fetal bovine serum (FBS)", role: "reagent" },
    { name: "Penicillin/Streptomycin/L-Glutamine", role: "reagent" },
    { name: "Trypan blue 0.4%", role: "reagent" },
    { name: "MycoAlert Mycoplasma Detection Kit", role: "reagent" },
    { name: "GenePrint 10 STR kit", role: "reagent" },
    { name: "T75 flasks", role: "consumable" },
    { name: "Countess II FL automated cell counter", role: "equipment" },
  ],
  parameters: [
    { key: "seeding_density", label: "Post-thaw / split seeding density", unit: "cells/mL", default: 400000 },
    { key: "max_density", label: "Maximum tolerated density", unit: "cells/mL", default: 2000000 },
    { key: "passage_number", label: "Working-stock passage number", unit: "passage" },
    { key: "viability", label: "Release viability", unit: "% viability", default: 90 },
  ],
  steps: [
    { index: 0, title: "Thaw & establish", instruction: "Thaw one cryovial at 37 °C (~90 s), dilute dropwise into pre-warmed complete medium, centrifuge 300 × g / 5 min to remove DMSO, seed at 3–5 × 10^5 cells/mL (THP-1 with 50 µM 2-mercaptoethanol). ⚠️ Release only if viability ≥ 90% by 48–72 h.", critical: true },
    { index: 1, title: "Maintain & expand", instruction: "Split every 2–3 days to keep density 0.3–1 × 10^6 cells/mL; log density and passage. ⚠️ Do not exceed 2 × 10^6 cells/mL (over-confluence acidifies medium and collapses viability). ⚠️ Cap working stocks at passage 20 — beyond ~25 the line drifts (slower growth, lower surface FLT3/CD135) and must not be used for quantitative pharmacology.", critical: true },
    { index: 2, title: "Authenticate & QC", instruction: "STR profiling vs reference, FLT3-ITD PCR (exon 14/15) for zygosity, and MycoAlert on supernatant. ⚠️ STR concordance must be ≥ 80%; ⚠️ any FLT3 genotype mismatch or MycoAlert ratio > 1.2 (mycoplasma-positive) blocks release and the culture is discarded.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.1186/1756-8722-4-13", label: "Takahashi 2011, J Hematol Oncol" },
    { kind: "doi", ref: "Haematologica-2003-88-416", label: "Bruserud 2003" },
  ],
};

// P2 ──────────────────────────────────────────────────────────────────────
const P2_DRAFT: ProtocolDraft = {
  title: "FLT3 TKI dose-response viability (CellTiter-Glo)",
  summary:
    "Quantify sensitivity of the AML panel (MOLM-14, MV4-11, THP-1) to FLT3 tyrosine-kinase inhibitors by 72 h dose-response and CellTiter-Glo ATP viability, deriving an IC50 per drug × line. Drugs: quizartinib (AC220), gilteritinib (ASP2215), midostaurin (PKC412), sorafenib, crenolanib. FLT3-addicted lines are killed at low nanomolar; the FLT3 wild-type THP-1 control is spared until micromolar (on-target signature).",
  materials: [
    { name: "RPMI-1640 (+L-glutamine) + 10% FBS", role: "reagent" },
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Gilteritinib (ASP2215)", role: "reagent" },
    { name: "Midostaurin (PKC412)", role: "reagent" },
    { name: "Sorafenib", role: "reagent" },
    { name: "Crenolanib", role: "reagent" },
    { name: "DMSO (vehicle)", role: "reagent" },
    { name: "CellTiter-Glo 2.0 reagent", role: "reagent" },
    { name: "96-well white flat-bottom plates", role: "consumable" },
    { name: "GloMax Discover microplate reader", role: "equipment" },
  ],
  parameters: [
    { key: "drug_concentration", label: "Top dose / serial-dilution range", unit: "nM", default: 1000 },
    { key: "incubation_time", label: "Drug exposure before readout", unit: "h", default: 72 },
    { key: "dmso_pct", label: "Final DMSO (vehicle) concentration", unit: "%", default: 0.1 },
    { key: "cell_density", label: "Seeding density per well", unit: "cells/mL", default: 50000 },
  ],
  steps: [
    { index: 0, title: "Seed", instruction: "From a ≤ p20, QC-passed, log-phase stock, seed 5 × 10^4 cells/mL (5 × 10^3 cells/well, 100 µL) into inner wells. ⚠️ Do not use outer/edge wells for data — 72 h evaporation skews them; fill the edge ring with PBS.", critical: true },
    { index: 1, title: "Prepare drug plate", instruction: "Serial-dilute each TKI 0.1 nM → 1000 nM (extend to 10 000 nM for THP-1). Include DMSO-vehicle and blank columns. ⚠️ Keep final DMSO ≤ 0.1% in every well — > 0.1% is independently cytotoxic and confounds the drug effect. Hold DMSO isovolumetric across the plate.", critical: true },
    { index: 2, title: "Treat & incubate", instruction: "Stamp drug onto cells; incubate 72 h at 37 °C / 5% CO2. ⚠️ Do not read before 48 h — shorter exposure underestimates cytotoxicity and inflates the apparent IC50.", critical: true },
    { index: 3, title: "Read & analyse", instruction: "Add CellTiter-Glo 1:1, read luminescence, normalize to DMSO-vehicle (= 100%), fit % viability vs log[drug] to a 4-parameter logistic; report IC50 + 95% CI + Hill slope. ⚠️ A very steep Hill slope suggests off-target/non-specific killing — interpret with care." },
  ],
  sources: [
    { kind: "doi", ref: "10.1186/1756-8722-4-13", label: "Takahashi 2011, J Hematol Oncol" },
    { kind: "doi", ref: "10.1038/s41598-021-02221-2", label: "Sci Rep 2021" },
    { kind: "doi", ref: "10.3390/ijms19103198", label: "IJMS 2018" },
  ],
};

// P3 ──────────────────────────────────────────────────────────────────────
const P3_DRAFT: ProtocolDraft = {
  title: "Apoptosis by Annexin V-FITC / PI flow cytometry",
  summary:
    "Measure FLT3-TKI-induced apoptosis in FLT3-ITD AML lines (MOLM-14, MV4-11) by Annexin V-FITC / propidium iodide dual staining and flow cytometry. Quantifies the % apoptotic (Annexin V+) population after quizartinib or gilteritinib treatment, complementing the viability IC50 (P2) with a mechanism (programmed cell death).",
  materials: [
    { name: "Annexin V-FITC", role: "reagent" },
    { name: "Propidium iodide (PI)", role: "reagent" },
    { name: "Annexin V binding buffer (with Ca2+)", role: "reagent" },
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Gilteritinib (ASP2215)", role: "reagent" },
    { name: "DMSO (vehicle)", role: "reagent" },
    { name: "BD FACSCanto II flow cytometer", role: "equipment" },
  ],
  parameters: [
    { key: "drug_concentration", label: "TKI concentration", unit: "nM", default: 10 },
    { key: "staining_time", label: "Annexin V/PI staining time", unit: "min", default: 15 },
    { key: "cell_number", label: "Cells stained per sample", unit: "cells", default: 200000 },
    { key: "incubation_time", label: "Drug exposure before staining", unit: "h", default: 48 },
  ],
  steps: [
    { index: 0, title: "Treat", instruction: "Treat 2 × 10^5 cells/sample with TKI (or DMSO vehicle) for 24–72 h. ⚠️ Use ≥ 1 × 10^5 cells per sample — fewer gives poor statistics and unreliable gating.", critical: true },
    { index: 1, title: "Stain", instruction: "Wash, resuspend in Annexin V binding buffer, add Annexin V-FITC + PI, incubate 15 min in the dark. ⚠️ The binding buffer MUST contain Ca2+ — without calcium Annexin V does not bind phosphatidylserine and the assay reads no apoptosis.", critical: true },
    { index: 2, title: "Acquire", instruction: "Acquire on the flow cytometer; gate Annexin V+ (early + late apoptotic). ⚠️ Read within 1 h of staining — delayed acquisition lets PI leak into live cells and inflates false-positive death.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.3390/ijms19103198", label: "IJMS 2018" },
    { kind: "doi", ref: "10.1038/s41598-021-02221-2", label: "Sci Rep 2021" },
  ],
};

// P4 ──────────────────────────────────────────────────────────────────────
const P4_DRAFT: ProtocolDraft = {
  title: "Phospho-signaling Western blot (p-STAT5/p-AKT/p-ERK)",
  summary:
    "Probe FLT3 downstream signalling by phospho-Western blot: p-FLT3, p-STAT5, p-AKT, p-ERK vs total protein and β-actin loading control, in MOLM-14/MV4-11 (FLT3-ITD) vs THP-1 (FLT3-WT). FLT3 TKIs (quizartinib, gilteritinib) abolish p-STAT5 within hours in FLT3-ITD lines — the pharmacodynamic proof of on-target FLT3 inhibition behind the viability/apoptosis phenotypes.",
  materials: [
    { name: "RIPA lysis buffer + protease/phosphatase inhibitors", role: "reagent" },
    { name: "Anti-phospho-STAT5 antibody", role: "reagent" },
    { name: "Anti-phospho-AKT antibody", role: "reagent" },
    { name: "Anti-phospho-ERK antibody", role: "reagent" },
    { name: "Anti-β-actin antibody (loading control)", role: "reagent" },
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Gilteritinib (ASP2215)", role: "reagent" },
    { name: "PVDF membrane", role: "consumable" },
    { name: "Bio-Rad ChemiDoc imager", role: "equipment" },
  ],
  parameters: [
    { key: "drug_concentration", label: "TKI concentration", unit: "nM", default: 10 },
    { key: "treatment_time", label: "TKI treatment time before lysis", unit: "h", default: 2 },
    { key: "protein_load_ug", label: "Protein loaded per lane", unit: "µg", default: 20 },
    { key: "transfer_time", label: "Wet transfer time", unit: "min", default: 90 },
  ],
  steps: [
    { index: 0, title: "Treat & lyse", instruction: "Treat cells with TKI (or DMSO) 1–4 h, lyse in ice-cold RIPA with fresh protease + phosphatase inhibitors. ⚠️ Never omit the phosphatase inhibitor — without it phosphatases strip the phospho-epitopes during lysis and every lane loses phospho-signal.", critical: true },
    { index: 1, title: "SDS-PAGE", instruction: "Quantify protein, load 20–30 µg/lane, run SDS-PAGE. ⚠️ Do not overload (> ~40 µg/lane) — overloaded lanes smear and blur band quantification.", critical: true },
    { index: 2, title: "Transfer", instruction: "Wet-transfer to PVDF. ⚠️ Do not over-transfer — excessive transfer time drives the high-MW FLT3 (~150–160 kDa) band through the membrane and it is lost.", critical: true },
    { index: 3, title: "Blot & image", instruction: "Block, probe phospho- then total antibodies + β-actin, image by chemiluminescence. ⚠️ Use in-date, properly stored primary antibodies — a degraded/expired antibody gives no signal and mimics a true negative.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.1186/1756-8722-4-13", label: "Takahashi 2011, J Hematol Oncol" },
    { kind: "doi", ref: "Haematologica-2003-88-416", label: "Bruserud 2003" },
  ],
};

// P5 ──────────────────────────────────────────────────────────────────────
const P5_DRAFT: ProtocolDraft = {
  title: "Acquired resistance modeling + FLT3-TKD mutation (Sanger)",
  summary:
    "Model acquired FLT3-TKI resistance by chronic dose-escalation of quizartinib on MOLM-14 until a resistant subline (MOLM-14-QuizR) emerges, then identify the mechanism by Sanger sequencing of the FLT3 tyrosine-kinase domain. Secondary TKD mutations D835Y and F691L (gatekeeper) confer quizartinib resistance while gilteritinib and crenolanib retain activity — the project's cross-resistance payoff, benchmarked against the naïve IC50 baseline (P2).",
  materials: [
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Gilteritinib (ASP2215)", role: "reagent" },
    { name: "Crenolanib", role: "reagent" },
    { name: "QIAamp DNA Mini Kit", role: "reagent" },
    { name: "FLT3 TKD PCR + Sanger primers", role: "reagent" },
    { name: "ABI 3500 Genetic Analyzer", role: "equipment" },
  ],
  parameters: [
    { key: "escalation_dose", label: "Current quizartinib escalation dose", unit: "nM", default: 1 },
    { key: "culture_weeks", label: "Weeks under selection", unit: "weeks" },
    { key: "drug_concentration", label: "Challenge / IC50 test concentration", unit: "nM" },
  ],
  steps: [
    { index: 0, title: "Dose-escalate", instruction: "Culture MOLM-14 under stepwise-increasing quizartinib (start ~1 nM), raising the dose only when growth recovers. ⚠️ Escalate slowly — jumping the dose too fast kills the whole culture (mass death) and the resistant line never emerges.", critical: true },
    { index: 1, title: "Confirm resistance", instruction: "Once cells grow at ≥ 50–100 nM, re-run the P2 dose-response: a resistant subline shows a right-shifted quizartinib IC50 (~50×). ⚠️ Contamination or a fast escalation can lose the culture — bank clean intermediates.", critical: true },
    { index: 2, title: "Genotype the TKD", instruction: "Extract gDNA, PCR + Sanger the FLT3 TKD. ⚠️ Low gDNA yield / poor quality makes the PCR fail — re-extract from a larger, healthy pellet. Expect D835Y or the F691L gatekeeper.", critical: true },
    { index: 3, title: "Cross-resistance", instruction: "Profile the resistant subline against gilteritinib and crenolanib. ⚠️ Gilteritinib/crenolanib should retain activity on D835Y/F691L — loss of activity would flag a different (e.g. off-target) mechanism.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "biorxiv-2022.04.15.488522", label: "bioRxiv 2022 (TKD resistance)" },
    { kind: "doi", ref: "10.3390/jpm15100431", label: "JPM 2025" },
  ],
};

// P6 ──────────────────────────────────────────────────────────────────────
const P6_DRAFT: ProtocolDraft = {
  title: "In vivo xenograft (MOLM-14-luc, NSG mice)",
  summary:
    "Translate the FLT3-TKI phenotype in vivo: engraft luciferase-tagged MOLM-14 into NSG mice, confirm engraftment by bioluminescence imaging (BLI), then treat with quizartinib (~10 mg/kg PO) vs vehicle and track tumour burden (BLI) and survival. Prolonged survival under quizartinib validates the in vitro sensitivity; relapse on treatment models in vivo resistance and ties back to the TKD-mutation story (P5).",
  materials: [
    { name: "MOLM-14-luc cells", role: "reagent" },
    { name: "Quizartinib (AC220), PO formulation", role: "reagent" },
    { name: "Vehicle (22% HP-β-CD)", role: "reagent" },
    { name: "D-luciferin", role: "reagent" },
    { name: "NSG mice", role: "consumable" },
    { name: "IVIS Spectrum bioluminescence imager", role: "equipment" },
  ],
  parameters: [
    { key: "dose_mg_kg", label: "Quizartinib dose", unit: "mg/kg", default: 10 },
    { key: "treatment_days", label: "Treatment duration", unit: "days", default: 28 },
    { key: "engraftment_days", label: "Days to confirmed engraftment", unit: "days", default: 7 },
  ],
  steps: [
    { index: 0, title: "Engraft & confirm", instruction: "Inject MOLM-14-luc IV into NSG mice; confirm engraftment by BLI around day 7. ⚠️ Exclude any cohort with poor/failed engraftment (low BLI signal) — it cannot support a treatment readout.", critical: true },
    { index: 1, title: "Randomize & dose", instruction: "Randomize engrafted mice to quizartinib ~10 mg/kg PO daily vs vehicle. ⚠️ Do not delay dosing > 7 days after engraftment — a high starting tumour burden blunts efficacy.", critical: true },
    { index: 2, title: "Monitor", instruction: "Track tumour burden (serial BLI) and survival. ⚠️ Tumour regrowth while on quizartinib = in vivo resistance (relapse) — capture and genotype for TKD mutations (link to P5).", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.3390/jpm15100431", label: "JPM 2025" },
    { kind: "doi", ref: "10.1038/s41598-021-02221-2", label: "Sci Rep 2021" },
  ],
};

export const AML_DRAFTS: Record<string, ProtocolDraft> = {
  P1: P1_DRAFT,
  P2: P2_DRAFT,
  P3: P3_DRAFT,
  P4: P4_DRAFT,
  P5: P5_DRAFT,
  P6: P6_DRAFT,
};

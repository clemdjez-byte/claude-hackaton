// scripts/demo-protocols.ts — 2 detailed "demo" protocols (8 real steps each,
// English). createProtocol auto-appends a final "Results" step (isResult), so the
// stored protocols have 9 steps (8 procedural + Results) — do NOT add a Results
// step here. ⚠️ step thresholds become failure_mode nodes. Both reuse the AML
// hubs (MOLM-14, MV4-11, quizartinib, gilteritinib, FLT3-ITD) for KG coherence.
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";

// D1 ──────────────────────────────────────────────────────────────────────
const D1_DRAFT: ProtocolDraft = {
  title: "TKI drug-synergy assay (quizartinib + venetoclax, Bliss)",
  summary:
    "Quantify synergy between the FLT3 inhibitor quizartinib and the BCL-2 inhibitor venetoclax in FLT3-ITD AML lines (MOLM-14, MV4-11) using a checkerboard combination matrix, 72 h CellTiter-Glo viability, and Bliss-independence / HSA scoring. The rationale: FLT3-ITD signalling props up anti-apoptotic MCL-1/BCL-2, so co-inhibiting FLT3 and BCL-2 is expected to be synergistic — and to re-sensitize quizartinib-resistant sublines. THP-1 (FLT3-WT) is the on-target specificity control.",
  materials: [
    { name: "RPMI-1640 (+L-glutamine) + 10% FBS", role: "reagent" },
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Venetoclax (ABT-199)", role: "reagent" },
    { name: "DMSO (vehicle)", role: "reagent" },
    { name: "CellTiter-Glo 2.0 reagent", role: "reagent" },
    { name: "96-well white flat-bottom plates", role: "consumable" },
    { name: "Tecan D300e digital dispenser", role: "equipment" },
    { name: "GloMax Discover microplate reader", role: "equipment" },
  ],
  parameters: [
    { key: "drug_concentration", label: "Quizartinib top dose", unit: "nM", default: 100 },
    { key: "venetoclax_concentration", label: "Venetoclax top dose", unit: "nM", default: 1000 },
    { key: "incubation_time", label: "Drug exposure before readout", unit: "h", default: 72 },
    { key: "dmso_pct", label: "Final DMSO (vehicle)", unit: "%", default: 0.1 },
    { key: "cell_density", label: "Seeding density per well", unit: "cells/mL", default: 50000 },
  ],
  steps: [
    { index: 0, title: "Seed cells", instruction: "From a ≤ p20, QC-passed, log-phase stock, seed 5 × 10^4 cells/mL (5 × 10^3 cells/well, 100 µL) into inner wells of a 96-well white plate. ⚠️ Do not use outer/edge wells for data — 72 h evaporation skews them; fill the edge ring with PBS.", critical: true },
    { index: 1, title: "Prepare single-agent dilution series", instruction: "Serial-dilute quizartinib (0.1–100 nM) and venetoclax (1–1000 nM) so each drug spans its own IC50. ⚠️ Keep final DMSO ≤ 0.1% in every well — > 0.1% is independently cytotoxic and confounds the synergy call.", critical: true },
    { index: 2, title: "Build the combination matrix", instruction: "Lay out a checkerboard (e.g. 6 × 6) of quizartinib × venetoclax concentrations, plus single-agent rows/columns and DMSO-vehicle + blank wells. ⚠️ A misaligned matrix or offset dilutions corrupts the whole response surface — verify the plate map before dispensing.", critical: true },
    { index: 3, title: "Dispense drugs", instruction: "Stamp both drugs onto the cells with a D300e (or isovolumetric multichannel). ⚠️ Hold DMSO isovolumetric across the plate so the vehicle does not track with dose.", critical: true },
    { index: 4, title: "Incubate", instruction: "Incubate 72 h at 37 °C / 5% CO2. ⚠️ Do not read before 48 h — shorter exposure underestimates cytotoxicity and distorts the synergy surface.", critical: true },
    { index: 5, title: "Read viability", instruction: "Equilibrate to RT, add CellTiter-Glo 1:1, shake 2 min, rest 10 min, read luminescence on the GloMax; normalize each well to the mean DMSO-vehicle (= 100% viability).", critical: false },
    { index: 6, title: "Compute synergy", instruction: "For each matrix cell, compare the observed combined effect to the Bliss-independence expectation (and HSA); derive a synergy score/matrix. ⚠️ A poorly chosen synergy threshold over-calls synergy — fix the cutoff a priori and report the score with its model.", critical: true },
    { index: 7, title: "Interpret", instruction: "Classify synergy vs additivity vs antagonism, flag single-agent-toxic wells, and note whether the combination re-sensitizes a quizartinib-resistant subline. Compare against the naïve single-agent IC50 baseline (P2).", critical: false },
  ],
  sources: [
    { kind: "doi", ref: "10.1186/1756-8722-4-13", label: "Takahashi 2011, J Hematol Oncol" },
    { kind: "doi", ref: "10.1038/s41598-021-02221-2", label: "Sci Rep 2021" },
    { kind: "doi", ref: "10.3390/jpm15100431", label: "JPM 2025" },
  ],
};

// D2 ──────────────────────────────────────────────────────────────────────
const D2_DRAFT: ProtocolDraft = {
  title: "Clonogenic colony-forming (CFU) assay in methylcellulose (± TKI)",
  summary:
    "Measure the clonogenic (self-renewal) capacity of FLT3-ITD AML lines (MOLM-14, MV4-11) and their quizartinib-resistant subline in semi-solid methylcellulose, with and without FLT3 TKI. Single cells are suspended in methylcellulose, cultured 10–14 days, and scored as colonies (> 50 cells); FLT3-selective TKIs are expected to suppress colony formation in ITD-addicted lines while sparing the FLT3-WT THP-1 control. This clonogenic readout complements the bulk viability IC50 (P2) with a stem/progenitor-like endpoint.",
  materials: [
    { name: "MethoCult methylcellulose base medium", role: "reagent" },
    { name: "Recombinant cytokines (SCF, IL-3, GM-CSF)", role: "reagent" },
    { name: "Quizartinib (AC220)", role: "reagent" },
    { name: "Gilteritinib (ASP2215)", role: "reagent" },
    { name: "DMSO (vehicle)", role: "reagent" },
    { name: "Trypan blue 0.4%", role: "reagent" },
    { name: "Gridded 35 mm culture dishes + blunt-end needles", role: "consumable" },
    { name: "Olympus CKX53 inverted microscope", role: "equipment" },
  ],
  parameters: [
    { key: "seeding_density_cfu", label: "Cells plated per dish", unit: "cells/dish", default: 500 },
    { key: "drug_concentration", label: "TKI concentration", unit: "nM", default: 10 },
    { key: "incubation_days", label: "Culture duration", unit: "days", default: 12 },
    { key: "colony_threshold", label: "Minimum cells scored as a colony", unit: "cells", default: 50 },
  ],
  steps: [
    { index: 0, title: "Prepare methylcellulose medium", instruction: "Thaw MethoCult, supplement with cytokines (SCF/IL-3/GM-CSF), mix gently and let bubbles settle. ⚠️ Air bubbles trapped in the viscous medium disrupt even plating and confound colony scoring — rest until clear.", critical: true },
    { index: 1, title: "Count & assess viability", instruction: "Count the single-cell suspension with trypan blue; ensure a true single-cell prep. ⚠️ Cell clumps seed pseudo-colonies and give uneven, uncountable plates — filter/triturate to break aggregates.", critical: true },
    { index: 2, title: "Dilute to target density", instruction: "Dilute to the plating density (e.g. 500–1000 cells/dish). ⚠️ Too high → colonies merge and cannot be scored; ⚠️ too low → poor counting statistics. Stay in the linear plating range.", critical: true },
    { index: 3, title: "Mix cells + drug into methylcellulose", instruction: "Add cells and TKI (or DMSO vehicle) into the methylcellulose, vortex briefly, and rest to de-bubble. ⚠️ Keep DMSO carry-over low (≤ 0.1% final) — solvent toxicity would masquerade as reduced clonogenicity.", critical: true },
    { index: 4, title: "Plate", instruction: "Dispense the mixture into gridded dishes with a blunt-end needle, tilting to spread evenly. ⚠️ Uneven spreading concentrates colonies and biases the count.", critical: true },
    { index: 5, title: "Incubate", instruction: "Culture 10–14 days at 37 °C / 5% CO2 in a humidified incubator. ⚠️ Evaporation over two weeks dries the gel and kills colonies — include a water reservoir dish and do not disturb.", critical: true },
    { index: 6, title: "Score colonies", instruction: "Under the inverted microscope, count aggregates of > 50 cells as one colony. ⚠️ A mis-set scoring threshold (counting < 50-cell clusters, or missing dense colonies) inflates or deflates the CFU count — score blinded and consistently.", critical: true },
    { index: 7, title: "Normalize & interpret", instruction: "Compute CFU% (colonies / cells plated) and normalize to the vehicle arm; compare drug arms and cell lines. Interpret suppression of clonogenicity as on-target FLT3 dependence (ITD lines) vs sparing of THP-1.", critical: false },
  ],
  sources: [
    { kind: "doi", ref: "10.1186/1756-8722-4-13", label: "Takahashi 2011, J Hematol Oncol" },
    { kind: "doi", ref: "Haematologica-2003-88-416", label: "Bruserud 2003" },
    { kind: "doi", ref: "10.3390/ijms19103198", label: "IJMS 2018" },
  ],
};

export const DEMO_DRAFTS: Record<string, ProtocolDraft> = {
  D1: D1_DRAFT,
  D2: D2_DRAFT,
};

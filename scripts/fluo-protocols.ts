// scripts/fluo-protocols.ts — the 6 fluorescent-labeling protocol drafts (F1–F6, English).
// Reuses the app's canonical parameter keys (mitotracker_conc, hoechst_conc,
// staining_incubation_time, pfa_exposure_time, cell_density) so KG hubs link, plus
// a few new keys (membrane_potential_probe_conc, depolarizer_conc, permeabilization_time,
// wash_count, imaging_exposure). ⚠️ step thresholds become failure_mode nodes.
import type { ProtocolDraft } from "@/lib/bench/protocol-studio/schema";

// F1 ──────────────────────────────────────────────────────────────────────
const F1_DRAFT: ProtocolDraft = {
  title: "Live-cell mitochondrial staining with MitoTracker (dye selection & loading)",
  summary:
    "Label mitochondria in live cells (HeLa, U2OS) with MitoTracker probes and optimize dye choice and loading. MitoTracker Green FM is live-only (lost on fixation); MitoTracker Red CMXRos and Deep Red are ΔΨm-dependent and fixable. Choose the dye to match the endpoint, load at 37 °C, wash, and image, finding the signal-to-noise optimum (~100–200 nM). A FCCP depolarization spot-check proves the CMXRos/Deep Red signal is potential-dependent, not a pure mass marker.",
  materials: [
    { name: "MitoTracker Green FM", role: "reagent" },
    { name: "MitoTracker Red CMXRos", role: "reagent" },
    { name: "MitoTracker Deep Red FM", role: "reagent" },
    { name: "DMSO (dye vehicle)", role: "reagent" },
    { name: "FCCP (depolarization control)", role: "reagent" },
    { name: "Phenol-red-free imaging medium", role: "reagent" },
    { name: "Glass-bottom imaging dishes", role: "consumable" },
    { name: "Confocal microscope (Zeiss LSM 900)", role: "equipment" },
  ],
  parameters: [
    { key: "mitotracker_conc", label: "MitoTracker working concentration", unit: "nM", default: 150 },
    { key: "staining_incubation_time", label: "Dye loading time at 37 °C", unit: "min", default: 30 },
    { key: "cell_density", label: "Seeding density", unit: "cells/mL", default: 100000 },
  ],
  steps: [
    { index: 0, title: "Seed", instruction: "Seed HeLa/U2OS in a glass-bottom dish and grow to ~60–70% confluence in phenol-red-free medium. ⚠️ Over-confluent cultures take up dye unevenly and stain patchily.", critical: true },
    { index: 1, title: "Choose the dye for the endpoint", instruction: "For a LIVE endpoint use MitoTracker Green FM; for a FIXED endpoint use a fixable ΔΨm dye (CMXRos / Deep Red). ⚠️ MitoTracker Green FM is LIVE-ONLY — fixing after Green FM staining loses the signal entirely.", critical: true },
    { index: 2, title: "Load dye", instruction: "Add MitoTracker at 100–200 nM in warm medium, 30 min at 37 °C in the dark, then wash. ⚠️ > 500 nM gives non-specific cytoplasmic/background staining; ⚠️ < 20 nM or < 15 min under-stains (weak/undetectable signal).", critical: true },
    { index: 3, title: "Validate potential-dependence", instruction: "For CMXRos/Deep Red, run a paired FCCP (10–40 µM, 30–60 min) sample: signal should drop, proving the readout is ΔΨm-dependent. ⚠️ Treat CMXRos/Deep Red as ΔΨm probes, not quantitative mitochondrial-mass markers.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.1002/cyto.a.20033", label: "Pendergrass 2004, Cytometry A" },
    { kind: "doi", ref: "10.1083/jcb.201909154", label: "Horn 2020, J Cell Biol" },
    { kind: "sop", ref: "MP-07510", label: "MitoTracker Probes product manual (Thermo)" },
  ],
};

// F2 ──────────────────────────────────────────────────────────────────────
const F2_DRAFT: ProtocolDraft = {
  title: "Nuclear counterstaining with Hoechst 33342 (concentration & toxicity)",
  summary:
    "Counterstain nuclei with the cell-permeant DNA dye Hoechst 33342 and optimize concentration against toxicity. ~5 µg/mL for 15 min is typical for short endpoints; long-term live imaging requires a much gentler 7–28 nM to avoid phototoxicity and cell-cycle arrest. Compare against DAPI (fixed/permeabilized only) and watch for Hoechst bleed-through into the green (GFP) channel.",
  materials: [
    { name: "Hoechst 33342", role: "reagent" },
    { name: "DAPI", role: "reagent" },
    { name: "PBS", role: "reagent" },
    { name: "Phenol-red-free imaging medium", role: "reagent" },
    { name: "Glass-bottom imaging dishes", role: "consumable" },
    { name: "Widefield fluorescence microscope (Nikon Ti2)", role: "equipment" },
  ],
  parameters: [
    { key: "hoechst_conc", label: "Hoechst 33342 concentration", unit: "nM", default: 1600 },
    { key: "staining_incubation_time", label: "Staining time", unit: "min", default: 15 },
    { key: "cell_density", label: "Seeding density", unit: "cells/mL", default: 100000 },
  ],
  steps: [
    { index: 0, title: "Stain", instruction: "Add Hoechst 33342 to cells and incubate 10–15 min in the dark. Typical short-endpoint working range ~1–5 µg/mL (~1600–8000 nM). ⚠️ High concentration (e.g. 20 µg/mL) is toxic — condensed/pyknotic nuclei and cell-cycle arrest.", critical: true },
    { index: 1, title: "Long-term imaging regime", instruction: "For live imaging over hours, drop to a gentle 7–28 nM. ⚠️ 5 µg/mL under prolonged illumination causes phototoxicity; use 7–28 nM for long-term.", critical: true },
    { index: 2, title: "Channel setup", instruction: "Acquire Hoechst in the blue channel (ex ~350 / em ~461). ⚠️ Hoechst emission bleeds into the green/GFP channel — set up compensation or spectral separation, otherwise false GFP+ signal.", critical: true },
  ],
  sources: [
    { kind: "sop", ref: "Hoechst-33342-appnote-2026", label: "Hoechst 33342 optimal-concentration app note" },
    { kind: "doi", ref: "10.1002/cyto.a.20033", label: "Pendergrass 2004, Cytometry A" },
  ],
};

// F3 ──────────────────────────────────────────────────────────────────────
const F3_DRAFT: ProtocolDraft = {
  title: "Mitochondrial membrane potential by flow cytometry (TMRM/TMRE/JC-1)",
  summary:
    "Quantify mitochondrial membrane potential (ΔΨm) in live cells by flow cytometry using Nernstian probes TMRM/TMRE (non-quench mode, 20–100 nM) or the ratiometric JC-1. Every ΔΨm claim is validated with a FCCP/CCCP depolarization control that must collapse the signal. Loading order and quench-mode artifacts are the main confounders.",
  materials: [
    { name: "TMRM", role: "reagent" },
    { name: "TMRE", role: "reagent" },
    { name: "JC-1", role: "reagent" },
    { name: "FCCP", role: "reagent" },
    { name: "CCCP", role: "reagent" },
    { name: "Flow cytometry tubes", role: "consumable" },
    { name: "BD LSRFortessa flow cytometer", role: "equipment" },
  ],
  parameters: [
    { key: "membrane_potential_probe_conc", label: "TMRM/TMRE/JC-1 concentration", unit: "nM", default: 50 },
    { key: "staining_incubation_time", label: "Probe loading time", unit: "min", default: 30 },
    { key: "depolarizer_conc", label: "FCCP/CCCP depolarizer concentration", unit: "µM", default: 20 },
  ],
  steps: [
    { index: 0, title: "Load probe", instruction: "Load TMRM/TMRE at 20–100 nM (non-quench mode) or JC-1 per kit, 20–30 min at 37 °C. ⚠️ Quench-mode over-concentration gives paradoxical/inverted signal — stay in the non-quench range.", critical: true },
    { index: 1, title: "Depolarization control", instruction: "Run a paired FCCP or CCCP sample (10–40 µM, 30–60 min): the ΔΨm signal MUST collapse. ⚠️ Without a FCCP/CCCP control the ΔΨm claim is uninterpretable — you cannot prove the readout reflects potential.", critical: true },
    { index: 2, title: "Acquire", instruction: "Acquire on the flow cytometer; report MFI (TMRM/TMRE) or red/green ratio (JC-1). ⚠️ Loading order matters — pre-load vs post-treatment changes the signal; keep it consistent across arms.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.1002/cyto.a.20033", label: "Pendergrass 2004, Cytometry A" },
    { kind: "doi", ref: "ijms-22-06263", label: "IJMS 2021 (TMRM/TMRE live-cell ΔΨm)" },
  ],
};

// F4 ──────────────────────────────────────────────────────────────────────
const F4_DRAFT: ProtocolDraft = {
  title: "PFA fixation optimized for fluorescence retention",
  summary:
    "Fix fluorescently-labeled cells while preserving signal. Standard 3–4% paraformaldehyde (PFA), 10–15 min, freshly prepared, wash 3× PBS. Critically, PFA alone poorly preserves ΔΨm-dye signal (TMRE lost) — adding 0.1% glutaraldehyde (GA) retains it (Qin 2021). Over-fixation causes quenching, autofluorescence and artifacts; live-only dyes (Green FM) are never retained.",
  materials: [
    { name: "Paraformaldehyde (PFA)", role: "reagent" },
    { name: "Glutaraldehyde (GA)", role: "reagent" },
    { name: "PBS", role: "reagent" },
    { name: "MitoTracker Red CMXRos", role: "reagent" },
    { name: "TMRE", role: "reagent" },
    { name: "Fume hood", role: "equipment" },
  ],
  parameters: [
    { key: "pfa_exposure_time", label: "PFA fixation time", unit: "min", default: 12 },
    { key: "fixative_pct", label: "PFA concentration", unit: "%", default: 4 },
    { key: "fixation_temp", label: "Fixation temperature", unit: "°C", default: 22 },
  ],
  steps: [
    { index: 0, title: "Fix", instruction: "Fix in freshly prepared 3–4% PFA, 10–15 min at RT (or 4 °C), then wash 3× PBS. Handle formaldehyde in a fume hood (hazardous/carcinogenic). ⚠️ Over-fixation (too long or > ~4%, e.g. 8% / 30 min) causes quenching, autofluorescence and imaging artifacts.", critical: true },
    { index: 1, title: "Match fixative to dye", instruction: "For ΔΨm dyes (TMRE/TMRM), add 0.1% glutaraldehyde to the PFA — PFA+GA retains the potential-dependent signal. ⚠️ PFA-only loses TMRE/ΔΨm-dye signal; ⚠️ MitoTracker Green FM / Red FM are live-only and are NOT retained after any fixation.", critical: true },
    { index: 2, title: "Freshness", instruction: "Use freshly prepared PFA. ⚠️ Aged/old PFA depolymerizes and fixes weakly, giving poor morphology and signal retention.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.3390/biom11050711", label: "Qin 2021, Biomolecules (PFA+GA)" },
    { kind: "doi", ref: "10.7554/eLife.79903", label: "Irgen-Gioro 2022, eLife (fixation artifacts)" },
  ],
};

// F5 ──────────────────────────────────────────────────────────────────────
const F5_DRAFT: ProtocolDraft = {
  title: "Multiplex staining + confocal imaging workflow (CMXRos + Hoechst + fixation)",
  summary:
    "Combine mitochondrial (MitoTracker Red CMXRos) and nuclear (Hoechst) labeling with PFA fixation into a multiplexed confocal imaging workflow. Manage spectral overlap with compensation/spectral unmixing and limit photobleaching with anti-fade mountant and restrained laser power/exposure. Ends in an optimized, reproducible two/three-color protocol replicated across cell lines.",
  materials: [
    { name: "MitoTracker Red CMXRos", role: "reagent" },
    { name: "MitoTracker Deep Red FM", role: "reagent" },
    { name: "Hoechst 33342", role: "reagent" },
    { name: "Paraformaldehyde (PFA)", role: "reagent" },
    { name: "Anti-fade mountant (ProLong Glass)", role: "reagent" },
    { name: "Coverslips / slides", role: "consumable" },
    { name: "Confocal microscope (Zeiss LSM 900)", role: "equipment" },
  ],
  parameters: [
    { key: "mitotracker_conc", label: "MitoTracker CMXRos concentration", unit: "nM", default: 150 },
    { key: "hoechst_conc", label: "Hoechst concentration", unit: "nM", default: 1600 },
    { key: "staining_incubation_time", label: "Staining time", unit: "min", default: 30 },
    { key: "pfa_exposure_time", label: "PFA fixation time", unit: "min", default: 12 },
    { key: "imaging_exposure", label: "Confocal exposure / dwell", unit: "ms", default: 2 },
  ],
  steps: [
    { index: 0, title: "Stain & fix", instruction: "Load CMXRos (100–200 nM) then Hoechst, wash, fix in 4% PFA 10–12 min, wash 3× PBS, mount with anti-fade. ⚠️ Insufficient washing (< 3× PBS) leaves high background and poor signal-to-noise.", critical: true },
    { index: 1, title: "Set channels", instruction: "Acquire blue (Hoechst), red (CMXRos), optionally far-red (Deep Red) and green (GFP). ⚠️ Spectral overlap (Hoechst→green, CMXRos→far-red) requires compensation/unmixing, otherwise bleed-through false signal.", critical: true },
    { index: 2, title: "Limit photobleaching", instruction: "Use anti-fade mountant and the lowest laser power / exposure that gives adequate SNR; acquire bleach-sensitive channels last. ⚠️ High laser / long exposure / no anti-fade bleaches the signal across a z-stack.", critical: true },
  ],
  sources: [
    { kind: "sop", ref: "MP-07510", label: "MitoTracker Probes product manual (Thermo)" },
    { kind: "doi", ref: "10.1083/jcb.201909154", label: "Horn 2020, J Cell Biol" },
  ],
};

// F6 ──────────────────────────────────────────────────────────────────────
const F6_DRAFT: ProtocolDraft = {
  title: "Controls, artifacts & assay validation",
  summary:
    "Validate the fluorescent-labeling assays with the controls that make their readouts trustworthy: autofluorescence baselines (unstained + fixed), potential-dependence panels (FCCP ± dyes), photobleaching decay curves, correct loading order, and the caveat that ΔΨm-dependent dyes (Deep Red/CMXRos) must not be read as mitochondrial-mass markers. Ties F1–F5 into one validated workflow.",
  materials: [
    { name: "MitoTracker Deep Red FM", role: "reagent" },
    { name: "MitoTracker Red CMXRos", role: "reagent" },
    { name: "FCCP", role: "reagent" },
    { name: "Triton X-100", role: "reagent" },
    { name: "PBS", role: "reagent" },
    { name: "Confocal microscope (Zeiss LSM 900)", role: "equipment" },
  ],
  parameters: [
    { key: "depolarizer_conc", label: "FCCP/CCCP concentration", unit: "µM", default: 20 },
    { key: "wash_count", label: "Number of PBS washes", unit: "washes", default: 3 },
    { key: "permeabilization_time", label: "Triton/saponin permeabilization time", unit: "min", default: 10 },
  ],
  steps: [
    { index: 0, title: "Autofluorescence baseline", instruction: "Image unstained (live and fixed) samples with identical settings to map background autofluorescence, especially after fixation. ⚠️ Over-fixation raises autofluorescence and can masquerade as signal.", critical: true },
    { index: 1, title: "Potential-dependence panel", instruction: "Run each ΔΨm dye ± FCCP to confirm the signal is potential-dependent. ⚠️ Reading a ΔΨm-dependent dye (Deep Red/CMXRos) as a mitochondrial-mass marker misinterprets a potential change as a mass change.", critical: true },
    { index: 2, title: "Wash & permeabilize controls", instruction: "Validate wash count (≥ 3× PBS) and, where internal targets need access, permeabilize with Triton 0.1–0.5% for 5–15 min. ⚠️ Over-permeabilization extracts membrane dyes/lipids and raises background; ⚠️ too few washes leave non-specific signal.", critical: true },
    { index: 3, title: "Photobleaching characterization", instruction: "Acquire a timelapse under imaging conditions to quantify signal decay and set acquisition limits. ⚠️ Without anti-fade and restrained illumination the signal bleaches during acquisition.", critical: true },
  ],
  sources: [
    { kind: "doi", ref: "10.3389/fncel.2016.00076", label: "Xiao 2016, Front Cell Neurosci" },
    { kind: "doi", ref: "10.7554/eLife.79903", label: "Irgen-Gioro 2022, eLife" },
  ],
};

export const FLUO_DRAFTS: Record<string, ProtocolDraft> = {
  F1: F1_DRAFT,
  F2: F2_DRAFT,
  F3: F3_DRAFT,
  F4: F4_DRAFT,
  F5: F5_DRAFT,
  F6: F6_DRAFT,
};

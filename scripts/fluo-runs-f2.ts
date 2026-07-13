// scripts/fluo-runs-f2.ts — F2 "Nuclear counterstaining with Hoechst 33342
// (concentration & toxicity)". Param keys: hoechst_conc (nM),
// staining_incubation_time (min), cell_density (cells/mL).
// Hoechst expressed in nM (5 µg/mL ≈ 8000 nM, 1 µg/mL ≈ 1600 nM,
// 20 µg/mL ≈ 32000 nM; gentle long-term 7–28 nM).
import type { RunSpec } from "./aml-common";

export const F2_RUNS: RunSpec[] = [
  // 1 ── fixed-endpoint baseline, ~5 µg/mL
  {
    slug: "hoechst-5ugml-fixed-hela",
    date: "2023-05-23",
    cellLine: "HeLa",
    params: { hoechst_conc: 8000, staining_incubation_time: 15, cell_density: 100000 },
    notes: [
      "2023-05-23 · operator Emmanuel Djezvedjian. Nuclear counterstain: Hoechst 33342 at 8000 nM (~5 µg/mL) on HeLa (~70% confluent), 15 min in the dark at 37 °C, then fixed in 4% PFA (10 min) and washed 3× PBS before imaging on the Zeiss LSM 900 (blue channel, ex ~350 / em ~461).",
      "Crisp, evenly stained nuclei with low cytoplasmic background; nuclear staining index ~8.5. Chromatin texture normal — no condensation at this short-endpoint dose.",
      "Fixed-endpoint baseline for the concentration/toxicity series. Hoechst 33342 is cell-permeant and stains both live and fixed cells, unlike DAPI.",
      "Reference dose for the live-cell comparison (2023-06-20) and the full ladder (2023-07-18).",
    ],
    measurement: { name: "Nuclear staining index", value: 8.5, unit: "a.u." },
    verdict: "success",
  },

  // 2 ── live-cell working dose, ~1 µg/mL
  {
    slug: "hoechst-1ugml-live-hela",
    date: "2023-06-20",
    cellLine: "HeLa",
    params: { hoechst_conc: 1600, staining_incubation_time: 15, cell_density: 120000 },
    notes: [
      "2023-06-20 · operator Emmanuel Djezvedjian. Live-cell nuclear counterstain: Hoechst 33342 at 1600 nM (~1 µg/mL) on HeLa, 15 min at 37 °C in phenol-red-free medium, single gentle PBS rinse, imaged live (no fixation).",
      "Nuclei well resolved with a much lower dye load than the fixed baseline; nuclear staining index ~7. Cells kept normal morphology and looked healthy.",
      "1 µg/mL is a good live-cell working dose — bright enough for nuclear segmentation while staying gentler than the 5 µg/mL fixed dose (cf. the 2023-05-23 baseline).",
      "Feeds the concentration ladder (2023-07-18) that pins the optimum against toxicity.",
    ],
    measurement: { name: "Nuclear staining index", value: 7, unit: "a.u." },
    verdict: "success",
  },

  // 3 ── concentration ladder → optimum defined
  {
    slug: "hoechst-concentration-ladder-hela",
    date: "2023-07-18",
    cellLine: "HeLa",
    params: { hoechst_conc: 1600, staining_incubation_time: 15, cell_density: 100000 },
    notes: [
      "2023-07-18 · operator Emmanuel Djezvedjian. Hoechst 33342 concentration ladder on HeLa: 800, 1600, 3200, 8000 and 16000 nM (~0.5, 1, 2, 5, 10 µg/mL), 15 min at 37 °C, imaged live in the blue channel.",
      "Signal rose with concentration up to ~8000 nM then plateaued; nuclear staining index ~7.5 at the chosen optimum. Above ~8000 nM background climbed and some nuclei started to look condensed.",
      "Optimum defined: ~1600 nM (1 µg/mL) for gentle live counterstaining, up to ~8000 nM (5 µg/mL) for bright fixed endpoints — consistent with the 2023-05-23 fixed and 2023-06-20 live runs.",
      "The condensation creeping in at the top of the ladder foreshadows the deliberate 20 µg/mL toxicity test (2023-08-22).",
    ],
    measurement: { name: "Nuclear staining index (optimum)", value: 7.5, unit: "a.u." },
    verdict: "success",
  },

  // 4 ── high concentration → toxicity (deviation)
  {
    slug: "hoechst-20ugml-toxicity-hela",
    date: "2023-08-22",
    cellLine: "HeLa",
    params: { hoechst_conc: 32000, staining_incubation_time: 15, cell_density: 130000 },
    notes: [
      "2023-08-22 · operator Emmanuel Djezvedjian. Deliberate high-dose test: Hoechst 33342 at 32000 nM (~20 µg/mL) on HeLa, 15 min at 37 °C, imaged live.",
      "Widespread toxicity: many nuclei were condensed/pyknotic and hyper-bright, cells rounded up, and the culture showed clear signs of cell-cycle arrest. Only ~45% of cells scored as viable.",
      "This is ~4× above the safe short-endpoint ceiling (~8000 nM) established by the ladder (2023-07-18). Over-concentrated Hoechst intercalates DNA and is directly cytotoxic.",
      "⚠️ Protocol threshold breached: high Hoechst concentration (20 µg/mL) is toxic. Keep short endpoints at ≤ ~5 µg/mL and use 7–28 nM for long-term live work.",
    ],
    measurement: { name: "Viable cells", value: 45, unit: "%" },
    deviation: {
      expected: "short-endpoint working range ≤ ~8000 nM (~5 µg/mL)",
      actual: "32000 nM (~20 µg/mL) Hoechst 33342",
      reason: "over-concentration is cytotoxic — condensed/pyknotic nuclei and cell-cycle arrest",
      severity: "major",
    },
    verdict: "failure",
    reason: "Hoechst over-concentration (20 µg/mL) — cytotoxic, pyknotic nuclei",
  },

  // 5 ── long-term imaging at 5 µg/mL → phototoxicity (deviation, partial)
  {
    slug: "hoechst-longterm-phototoxicity-hela",
    date: "2023-09-19",
    cellLine: "HeLa",
    params: { hoechst_conc: 8000, staining_incubation_time: 15, cell_density: 90000 },
    notes: [
      "2023-09-19 · operator Emmanuel Djezvedjian. Long-term live imaging: Hoechst 33342 at 8000 nM (~5 µg/mL) on HeLa kept in the medium through a multi-hour time-lapse under repeated UV (~350 nm) excitation.",
      "The short-endpoint dose looked fine at t=0 but caused progressive phototoxicity: after a few hours cells stopped dividing, nuclei brightened and rounded, and viability fell to ~65% by 6 h. Early frames segmented well — the damage is cumulative.",
      "Root cause is a DNA dye plus UV over time, not the counterstain concept itself. Recommend switching long-term imaging to a much gentler 7–28 nM Hoechst and minimizing UV dose (cf. Irgen-Gioro 2022, 10.7554/eLife.79903).",
      "⚠️ The 5 µg/mL dose that is safe for a single fixed endpoint (2023-05-23) is not safe sustained. Action item validated by the 20 nM / 24 h U2OS run (2023-10-17).",
    ],
    measurement: { name: "Viable cells at 6 h", value: 65, unit: "%" },
    deviation: {
      expected: "7–28 nM Hoechst for long-term live imaging",
      actual: "8000 nM (~5 µg/mL) sustained under repeated UV excitation over hours",
      reason: "phototoxicity — DNA dye plus UV damages cells during time-lapse",
      severity: "major",
    },
    verdict: "partial",
    reason: "phototoxicity — 5 µg/mL Hoechst too high for hours-long live imaging",
  },

  // 6 ── gentle long-term regime, 20 nM / 24 h
  {
    slug: "hoechst-20nm-gentle-24h-u2os",
    date: "2023-10-17",
    cellLine: "U2OS",
    params: { hoechst_conc: 20, staining_incubation_time: 1440, cell_density: 80000 },
    notes: [
      "2023-10-17 · operator Emmanuel Djezvedjian. Gentle long-term nuclear counterstain: Hoechst 33342 at 20 nM kept in the medium on U2OS for a 24 h live time-lapse, low UV dose, phenol-red-free medium.",
      "Nuclei stayed clearly resolvable for the full 24 h and cells kept dividing normally; ~96% viable at the endpoint. No condensation or pyknosis.",
      "Confirms the 7–28 nM gentle regime recommended after the phototoxic 5 µg/mL time-lapse (2023-09-19) — ~400× less dye than the short-endpoint dose, traded for a longer equilibration.",
      "U2OS chosen to check the regime transfers beyond HeLa; the low-dose window behaves the same.",
    ],
    measurement: { name: "Viable cells at 24 h", value: 96, unit: "%" },
    verdict: "success",
  },

  // 7 ── Hoechst → GFP bleed-through, no compensation (deviation, failure)
  {
    slug: "hoechst-gfp-bleedthrough-hela",
    date: "2023-11-14",
    cellLine: "HeLa-GFP",
    params: { hoechst_conc: 8000, staining_incubation_time: 15, cell_density: 110000 },
    notes: [
      "2023-11-14 · operator Emmanuel Djezvedjian. Hoechst 33342 counterstain at 8000 nM (~5 µg/mL) on HeLa-GFP, 15 min, blue (Hoechst) and green (GFP) channels acquired simultaneously through single bandpass filters with no compensation.",
      "GFP-negative cells scored as false GFP+: ~32% of the green signal was actually Hoechst bleed-through. The bright blue Hoechst emission has a tail into the green channel and swamped the true GFP readout.",
      "⚠️ Spectral overlap threshold hit: Hoechst emission bleeds into the green/GFP channel. With no compensation the GFP gate is meaningless.",
      "Fix: acquire channels sequentially, narrow the green emission window, or apply spectral unmixing/compensation. Re-run required before trusting any GFP quantification alongside a Hoechst counterstain.",
    ],
    measurement: { name: "False GFP+ fraction", value: 32, unit: "%" },
    deviation: {
      expected: "compensation or spectral separation for the Hoechst→green overlap",
      actual: "single-bandpass GFP acquisition with no compensation",
      reason: "Hoechst blue emission bleeds into the green/GFP channel — false GFP+",
      severity: "major",
    },
    verdict: "failure",
    reason: "spectral overlap, no compensation — Hoechst bleeds into GFP channel",
  },

  // 8 ── DAPI vs Hoechst on fixed/permeabilized cells
  {
    slug: "dapi-vs-hoechst-fixed-hela",
    date: "2023-12-12",
    cellLine: "HeLa",
    params: { hoechst_conc: 8000, staining_incubation_time: 15, cell_density: 100000 },
    notes: [
      "2023-12-12 · operator Emmanuel Djezvedjian. Side-by-side counterstain comparison on fixed (4% PFA) and permeabilized (0.1% Triton X-100) HeLa: DAPI vs Hoechst 33342, matched acquisition in the blue channel.",
      "On fixed/permeabilized cells both gave crisp nuclei — DAPI nuclear staining index ~8, Hoechst ~8.5, essentially equivalent for a fixed endpoint.",
      "Key difference is permeability: DAPI is poorly cell-permeant and really only works on fixed/permeabilized samples, whereas Hoechst 33342 is cell-permeant and works live or fixed. DAPI is fine here but cannot replace Hoechst for live counterstaining (cf. the 2023-06-20 live run).",
      "Notebook conclusion: use Hoechst for anything live, either dye for fixed/permeabilized endpoints; both sit in the blue channel, so the same GFP bleed-through caution applies (2023-11-14).",
    ],
    measurement: { name: "Nuclear staining index (DAPI)", value: 8, unit: "a.u." },
    verdict: "success",
  },
];

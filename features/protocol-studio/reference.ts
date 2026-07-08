// features/protocol-studio/reference.ts — protocole RT-qPCR de référence, sourcé.
// Sert de point de départ solide pour la démo (aucune dépendance au LLM pour
// démarrer). Two-step RT-qPCR (RT séparée puis qPCR SYBR Green), réaction 20 µL.
import type { ProtocolDraft } from "./schema";

export const RT_QPCR_REFERENCE: ProtocolDraft = {
  title: "RT-qPCR — expression génique (SYBR Green, two-step)",
  summary:
    "Transcription inverse de l'ARN total en cDNA, puis qPCR SYBR Green pour quantifier l'expression. Master mix de 20 µL, template ajouté par puits. Contrôle NTC obligatoire.",
  materials: [
    { name: "ARN total", role: "reagent" },
    { name: "Reverse transcriptase (M-MLV / SuperScript)", role: "reagent" },
    { name: "Random hexamers / oligo-dT", role: "reagent" },
    { name: "dNTPs", role: "reagent" },
    { name: "Inhibiteur de RNase", role: "reagent" },
    { name: "Master mix 2× SYBR Green (PowerUp)", role: "reagent" },
    { name: "Amorce forward", role: "reagent", stockConc: { value: 10, unit: "µM" } },
    { name: "Amorce reverse", role: "reagent", stockConc: { value: 10, unit: "µM" } },
    { name: "Eau nuclease-free", role: "reagent" },
    { name: "Plaque 96 puits qPCR + film optique", role: "consumable" },
    { name: "Thermocycleur temps réel", role: "equipment" },
  ],
  parameters: [
    { key: "n_reactions", label: "Nombre de réactions", default: 6, unit: "réactions" },
    { key: "overage_pct", label: "Excès de pipetage", default: 10, unit: "%" },
  ],
  recipe: {
    name: "qPCR master mix (SYBR Green, 20 µL)",
    finalVolumePerReaction: { value: 20, unit: "µL" },
    components: [
      { name: "Master mix 2×", perReaction: { value: 10, unit: "µL" } },
      { name: "Amorce F (10 µM)", perReaction: { value: 0.5, unit: "µL" } },
      { name: "Amorce R (10 µM)", perReaction: { value: 0.5, unit: "µL" } },
      { name: "Eau nuclease-free", perReaction: { value: 7, unit: "µL" } },
      { name: "Template cDNA", perReaction: { value: 2, unit: "µL" }, perWell: true },
    ],
  },
  steps: [
    {
      index: 0,
      title: "Préparer l'ARN sur glace",
      instruction: "Décongeler l'ARN total sur glace. Mesurer la concentration ; viser 10 pg–1 µg par réaction RT.",
    },
    {
      index: 1,
      title: "Mix de transcription inverse",
      instruction:
        "Assembler le mix RT : ARN, random hexamers/oligo-dT, dNTPs, tampon, inhibiteur de RNase, reverse transcriptase. Garder sur glace.",
    },
    {
      index: 2,
      title: "Programme RT",
      instruction: "25 °C 10 min (amorçage) → 42–50 °C 15–60 min (synthèse) → 85 °C 5 min (inactivation) → hold 4 °C.",
      durationSec: 3000,
      temperature: { value: 42, unit: "°C" },
      critical: true,
    },
    {
      index: 3,
      title: "Diluer le cDNA",
      instruction: "Diluer le cDNA (souvent 1:5 à 1:20) pour la qPCR. Garder sur glace.",
    },
    {
      index: 4,
      title: "Préparer le master mix qPCR",
      instruction:
        "Préparer le mix partagé (master mix 2×, amorces F/R, eau) pour le nombre de réactions + excès de pipetage. Volumes calculés par Octopus. Protéger le SYBR de la lumière.",
      critical: true,
    },
    {
      index: 5,
      title: "Aliquoter le mix",
      instruction: "Distribuer 18 µL de mix partagé par puits.",
      durationSec: 600,
    },
    {
      index: 6,
      title: "Ajouter template + NTC",
      instruction:
        "Ajouter 2 µL de cDNA par puits échantillon. Inclure un NTC (eau à la place du cDNA) : contrôle OBLIGATOIRE pour exclure contamination / primer-dimers.",
      critical: true,
    },
    {
      index: 7,
      title: "Sceller et centrifuger",
      instruction: "Sceller avec le film optique, centrifuger brièvement pour éliminer les bulles.",
    },
    {
      index: 8,
      title: "Cyclage qPCR",
      instruction:
        "50 °C 2 min (UDG) → 95 °C 2 min (hot-start) → 40 cycles [95 °C 15 s dénaturation, 60 °C 60 s hybridation+élongation, lecture fluo].",
      durationSec: 4500,
      temperature: { value: 60, unit: "°C" },
      critical: true,
    },
    {
      index: 9,
      title: "Melt curve",
      instruction:
        "95 °C 15 s → 60 °C 60 s → rampe continue 60 → 95 °C (~0,15 °C/s). Un pic unique et net = amplicon spécifique ; pics multiples = non-spécifique / primer-dimers.",
      durationSec: 900,
    },
    {
      index: 10,
      title: "Lecture des Ct",
      instruction:
        "Relever les Ct (plage exploitable ~15–35). Vérifier que le NTC est « Undetermined » ou ≥ 38–40 et ≥ 5 Ct après l'échantillon le plus tardif. Réplicats techniques dans ~0,5 Ct.",
      critical: true,
    },
  ],
  sources: [
    {
      kind: "doi",
      ref: "10.1373/clinchem.2008.112797",
      label: "Bustin et al., MIQE Guidelines, Clin Chem 2009 (Cq, NTC, efficacité 90–110 %, R² > 0.98)",
    },
    {
      kind: "url",
      ref: "https://documents.thermofisher.com/TFS-Assets/LSG/manuals/MAN0013511_PowerUp_mastermix_UG.pdf",
      label: "PowerUp SYBR Green Master Mix User Guide (composition 20 µL, cyclage UDG, melt curve)",
    },
  ],
};

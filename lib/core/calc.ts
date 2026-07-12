// lib/core/calc.ts — LE seul endroit qui produit un nombre.
// Fonctions PURES : sans db, sans LLM, sans I/O, testables à l'unité.
// Le modèle ne calcule jamais « de tête » ; il lit ces sorties et les explique.

import type { Quantity, Recipe, ResolvedComponent, ResolvedRecipe } from "./types";

/** Arrondi déterministe à `decimals` décimales, sans bruit flottant.
 *  round(13.200000000000001) === 13.2 */
export function round(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

// ── Conversion d'unités (dimensions volume / masse / molarité) ─────────
// Facteur vers l'unité de base de chaque dimension.
const UNIT_FACTORS: Record<string, { dim: string; toBase: number }> = {
  // volume → base litre
  L: { dim: "volume", toBase: 1 },
  mL: { dim: "volume", toBase: 1e-3 },
  "µL": { dim: "volume", toBase: 1e-6 },
  uL: { dim: "volume", toBase: 1e-6 },
  nL: { dim: "volume", toBase: 1e-9 },
  // masse → base gramme
  g: { dim: "mass", toBase: 1 },
  mg: { dim: "mass", toBase: 1e-3 },
  "µg": { dim: "mass", toBase: 1e-6 },
  ug: { dim: "mass", toBase: 1e-6 },
  ng: { dim: "mass", toBase: 1e-9 },
  // molarité → base molaire
  M: { dim: "molarity", toBase: 1 },
  mM: { dim: "molarity", toBase: 1e-3 },
  "µM": { dim: "molarity", toBase: 1e-6 },
  uM: { dim: "molarity", toBase: 1e-6 },
  nM: { dim: "molarity", toBase: 1e-9 },
};

export function convert(q: Quantity, toUnit: string, decimals = 6): Quantity {
  const from = UNIT_FACTORS[q.unit];
  const to = UNIT_FACTORS[toUnit];
  if (!from || !to) throw new Error(`Unité inconnue : ${q.unit} → ${toUnit}`);
  if (from.dim !== to.dim)
    throw new Error(`Dimensions incompatibles : ${q.unit} (${from.dim}) → ${toUnit} (${to.dim})`);
  return { value: round((q.value * from.toBase) / to.toBase, decimals), unit: toUnit };
}

/**
 * Met à l'échelle un master mix : volume/composant = unitaire × n × facteur d'excès.
 * L'excès (`overagePct`) s'applique UNIQUEMENT aux composants partagés ;
 * les composants `perWell` (ex. template) sont ajoutés puits par puits, sans excès.
 */
export function scaleMasterMix(recipe: Recipe, n: number, overagePct: number): ResolvedRecipe {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`n doit être un entier > 0 (reçu ${n})`);
  if (overagePct < 0) throw new Error(`overagePct doit être ≥ 0 (reçu ${overagePct})`);

  const factor = n * (1 + overagePct / 100); // ex. 24 × 1,1 = 26,4
  let sharedUnit = 0; // somme des volumes unitaires partagés (µL de base de la recette)
  let sharedTotalValue = 0;
  const unitOf = recipe.components[0]?.perReaction.unit ?? "µL";

  const components: ResolvedComponent[] = recipe.components.map((c) => {
    const shared = !c.perWell;
    const totalValue = shared
      ? c.perReaction.value * factor
      : c.perReaction.value * n; // perWell : sans excès
    if (shared) {
      sharedUnit += c.perReaction.value;
      sharedTotalValue += round(totalValue, 3);
    }
    return {
      name: c.name,
      perReaction: c.perReaction,
      total: { value: round(totalValue, 3), unit: c.perReaction.unit },
      shared,
    };
  });

  // Réserve morte = ce que l'excès ajoute au-delà du volume réellement distribué.
  const distributed = sharedUnit * n;
  const deadVolume = round(sharedTotalValue - distributed, 3);

  return {
    recipe: recipe.name,
    nReactions: n,
    overagePct,
    effectiveFactor: round(factor, 4),
    components,
    sharedTotal: { value: round(sharedTotalValue, 3), unit: unitOf },
    deadVolume: { value: deadVolume, unit: unitOf },
  };
}

/**
 * Dilution C1·V1 = C2·V2. Donne le volume de solution mère et de diluant
 * pour atteindre `finalConc` dans `finalVolume`.
 */
export function dilution(
  stockConc: Quantity,
  finalConc: Quantity,
  finalVolume: Quantity
): { stockVolume: Quantity; diluentVolume: Quantity; foldDilution: number } {
  const c1 = convert(stockConc, finalConc.unit).value;
  const c2 = finalConc.value;
  if (c1 <= 0) throw new Error("Concentration mère doit être > 0");
  if (c2 > c1) throw new Error("Concentration finale > concentration mère : impossible par dilution");
  const v1 = (c2 * finalVolume.value) / c1;
  return {
    stockVolume: { value: round(v1, 3), unit: finalVolume.unit },
    diluentVolume: { value: round(finalVolume.value - v1, 3), unit: finalVolume.unit },
    foldDilution: round(c1 / c2, 3),
  };
}

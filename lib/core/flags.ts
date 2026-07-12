// lib/core/flags.ts — interrupteurs débrayables, fail-closed.
// Un flag par brique, lu côté serveur, OFF par défaut : activé UNIQUEMENT
// si la variable d'env vaut exactement 'true'. Absente, vide, 'TRUE', '1' → OFF.
// Impossible d'activer pour tout le monde par oubli.

export const FLAGS = {
  protocolStudio: "FEATURE_PROTOCOL_STUDIO",
  workflowBuilder: "FEATURE_WORKFLOW_BUILDER",
  liveBench: "FEATURE_LIVE_BENCH",
  evidenceCapture: "FEATURE_EVIDENCE_CAPTURE",
  autoReport: "FEATURE_AUTO_REPORT",
  labMemory: "FEATURE_LAB_MEMORY",
  voiceCopilot: "FEATURE_VOICE_COPILOT",
  knowledgeGraph: "FEATURE_KNOWLEDGE_GRAPH",
} as const;

export type FeatureKey = keyof typeof FLAGS;

export class FeatureDisabledError extends Error {
  readonly feature: FeatureKey;
  readonly code = "FEATURE_DISABLED";
  constructor(feature: FeatureKey) {
    super(`Feature « ${feature} » désactivée (flag ${FLAGS[feature]} ≠ 'true').`);
    this.name = "FeatureDisabledError";
    this.feature = feature;
  }
}

/** fail-closed : seule la valeur exacte 'true' active. */
export function isEnabled(feature: FeatureKey): boolean {
  return process.env[FLAGS[feature]] === "true";
}

/** Garde serveur, à placer EN PREMIÈRE LIGNE de chaque fonction publique. */
export function assertEnabled(feature: FeatureKey): void {
  if (!isEnabled(feature)) throw new FeatureDisabledError(feature);
}

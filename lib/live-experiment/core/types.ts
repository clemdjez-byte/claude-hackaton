// lib/core/types.ts — types partagés, ZÉRO logique métier.
// Invariants de rigueur labo : une quantité porte toujours son unité,
// et toute affirmation affichée porte une source.

export type Id = string;
export type Ws = string; // workspace / lab
export type Json = unknown;

/** Jamais un nombre nu : l'unité voyage toujours avec la valeur. */
export interface Quantity {
  value: number;
  unit: string;
}

/** Provenance d'un fait. « Pas de citation → pas d'insight. » */
export interface SourceRef {
  kind: "doi" | "url" | "evidence" | "sop";
  ref: string;
  label?: string;
}

// ── Primitives réutilisées (héritent recherche / corbeille / indexation) ──
export interface Page {
  id: Id; // identifiant logique stable (constant à travers les versions)
  ws: Ws;
  type: string; // 'protocol' | 'workflow' | 'report'
  title: string;
  content: Json;
  version: number;
  latest: boolean;
  createdAt: string; // ISO
  draftDoc?: Json; // document Tiptap éditable (protocole) ; null si non édité dans l'éditeur-document
}

export interface Fichier {
  id: Id;
  ws: Ws;
  pageId?: Id;
  storageKey: string;
  mime: string;
  sha256: string;
  createdAt: string;
}

// ── Entités Octopus ───────────────────────────────────────────────────
export interface Material {
  name: string;
  role: "reagent" | "consumable" | "equipment";
  stockConc?: Quantity;
}

export interface ParamDef {
  key: string;
  label: string;
  default?: number;
  unit: string;
}

/** Un composant d'une recette (master mix). `perWell` = ajouté puits par
 *  puits (ex. template cDNA) → exclu de l'excès de pipetage partagé. */
export interface RecipeComponent {
  name: string;
  perReaction: Quantity;
  perWell?: boolean;
}

export interface Recipe {
  name: string;
  components: RecipeComponent[];
  finalVolumePerReaction?: Quantity;
}

export interface ResolvedComponent {
  name: string;
  perReaction: Quantity;
  total: Quantity;
  shared: boolean; // true = soumis à l'excès partagé
}

export interface ResolvedRecipe {
  recipe: string;
  nReactions: number;
  overagePct: number;
  effectiveFactor: number; // n × (1 + overage/100) pour les composants partagés
  components: ResolvedComponent[];
  sharedTotal: Quantity; // volume total du mix partagé (avec réserve morte)
  deadVolume: Quantity; // la réserve introduite par l'excès
}

export interface ProtocolStep {
  index: number;
  title: string;
  instruction: string;
  params?: Record<string, Quantity>;
  durationSec?: number; // timer suggéré
  temperature?: Quantity;
  critical?: boolean;
}

export interface Protocol {
  id: Id;
  ws: Ws;
  version: number;
  title: string;
  status: "draft" | "published" | "archived";
  summary?: string;
  materials: Material[];
  steps: ProtocolStep[];
  parameters: ParamDef[];
  recipe?: Recipe; // recette scalable (ex. master mix qPCR)
  sources: SourceRef[]; // citations obligatoires
}

export interface WorkflowNode {
  id: string;
  protocolId: Id;
  protocolVersion: number;
  label: string;
}
export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}
export interface Workflow {
  id: Id;
  ws: Ws;
  version: number;
  title: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type RunStatus = "active" | "paused" | "completed" | "aborted";
export interface Run {
  id: Id;
  ws: Ws;
  operator: Id;
  workflowId?: Id;
  workflowVersion?: number;
  protocolId: Id;
  protocolVersion: number; // FIGÉ au démarrage → reproductibilité
  status: RunStatus;
  scalingContext: Record<string, number>; // entrées résolues du calcul déterministe
  startedAt: string;
  endedAt?: string;
}

export type StepStatus = "pending" | "active" | "done" | "skipped";
export interface Step {
  id: Id;
  runId: Id;
  protocolStepIndex: number;
  title: string;
  status: StepStatus;
  resolvedParams?: Record<string, Quantity>; // SORTIE figée du calcul déterministe
  startedAt?: string;
  completedAt?: string;
}

export type EvidenceKind = "note" | "photo" | "measurement" | "deviation" | "data";
export interface Evidence {
  id: Id;
  runId: Id;
  stepId?: Id;
  authorId: Id;
  capturedAt: string;
  kind: EvidenceKind;
  body?: string;
  fileId?: Id;
  measurement?: { value: number; unit: string; instrument?: string };
  deviation?: {
    expected: string;
    actual: string;
    reason?: string;
    severity: "minor" | "major" | "critical";
  };
  source?: SourceRef;
}

export interface ReportCitation {
  claim: string;
  evidenceIds: Id[];
}
export interface ReportContent {
  objective: string;
  planned: string; // ce qui était prévu
  performed: string; // ce qui a réellement été fait
  observed: string; // ce qui a été observé
  interpretation: string; // ce que Octopus interprète (étiqueté comme tel)
  deviations: string[];
  openQuestions: string[];
  nextActions: string[];
  citations: ReportCitation[];
}

export type MemorySourceType = "run" | "protocol" | "evidence" | "report";
export interface MemoryEntry {
  id: Id;
  ws: Ws;
  sourceType: MemorySourceType;
  sourceId: Id;
  text: string;
  meta: Record<string, Json>;
  createdAt: string;
}
export interface MemoryHit extends MemoryEntry {
  score: number;
}

export interface KgEdge {
  id: Id;
  ws: Ws;
  relation: string; // uses_reagent | ran_protocol | derived_from | measured_with | produced_report
  fromType: string;
  fromId: Id;
  toType: string;
  toId: Id;
  createdAt: string;
}

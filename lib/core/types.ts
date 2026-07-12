// lib/core/types.ts — types partagés, ZÉRO logique métier.
// Invariants de rigueur labo : une quantité porte toujours son unité,
// et toute affirmation affichée porte une source.

import type { LanguageModel } from "ai";
import type { z } from "zod";
import type { Db } from "./db";

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
  folderId?: Id | null; // dossier de rangement dans l'explorateur ; null = racine
}

export interface Folder {
  id: Id;
  ws: Ws;
  name: string;
  parentId: Id | null;
  createdAt: string;
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

export type EdgeProvenance = "derived" | "extracted" | "entered";

export interface KgEdge {
  id: Id;
  ws: Ws;
  relation: string; // uses_reagent | ran_protocol | derived_from | measured_with | produced_report | instance_of | has_value | resulted_in | attributed_to | declares | uses_param
  fromType: string;
  fromId: Id;
  toType: string;
  toId: Id;
  provenance?: EdgeProvenance; // défaut 'derived' (rempli par l'adaptateur)
  confidence?: number; // défaut 1.0
  attrs?: Record<string, unknown>; // ex. has_value → { value, unit } ; attributed_to → { observed, unit }
  createdAt: string;
}

export type Verdict = "success" | "failure" | "partial";
export type ThresholdOperator = "<" | ">" | "=";

/** Verdict scientifique d'un run, SAISI par le chercheur (pas dérivable). */
export interface Outcome {
  id: Id;
  ws: Ws;
  runId: Id;
  verdict: Verdict;
  metric?: Quantity; // ex. { value: 82, unit: "% viability" }
  reason?: string; // "no bands", "contamination"…
  createdAt: string;
}

/** Règle causale `condition (seuil) → verdict + mécanisme`, extraite des ⚠️
 *  d'un protocole et rattachée à un ParameterType canonique. */
export interface FailureMode {
  id: Id;
  ws: Ws;
  protocolId: Id;
  paramTypeKey?: string; // clé canonique (absent pour une cause qualitative sans paramètre)
  operator?: ThresholdOperator; // règle numérique
  threshold?: number;
  unit?: string;
  trigger?: string; // condition qualitative ("contamination", "PBS au lieu du milieu")
  verdict: Verdict; // requis
  mechanism: string; // requis
  sourceRef?: SourceRef;
  createdAt: string;
}

/** Concept de paramètre canonique, hub partagé entre protocoles/runs. */
export interface ParameterType {
  id: Id;
  ws: Ws;
  key: string;
  label: string;
  unit: string;
  aliases: string[];
  createdAt: string;
}

/** Nœud canonique GÉNÉRIQUE de l'ontologie ouverte : registre partagé des
 *  entités objectives extraites par l'IA (réactif, instrument, opérateur,
 *  échantillon, date…). Généralise ParameterType à des `type` libres. La clé
 *  d'identité est `(ws, type, key)` : un même concept revu sous un autre libellé
 *  retombe sur la même ligne (réconciliation d'alias). NE stocke pas le contenu
 *  d'entités déjà tabulées ailleurs (protocol/run/report) : c'est un hub, pas un
 *  double. Le `type` reste un texte libre (comme fromType/toType sur kg_edge). */
export interface KgEntity {
  ws: Ws;
  type: string; // facette objective : reagent | instrument | operator | sample | date | …
  key: string; // clé canonique (slug/normalisée)
  label: string; // libellé lisible tel qu'écrit
  aliases: string[]; // libellés alternatifs reconnus (union au fil des extractions)
  attrs?: Record<string, unknown>;
  provenance?: EdgeProvenance; // défaut 'extracted' (créé par l'IA)
  confidence?: number; // défaut 1.0
  createdAt: string;
}

// ── Port LLM (contrat consommé par lib/core/llm.ts) ───────────────────────
// Le cœur ne parle jamais à un SDK fournisseur en direct : il passe par un
// provider qui implémente cette interface. Un seul point d'injection permet
// de changer de modèle ou de fournisseur sans toucher aux briques.

/** Tâches LLM du cœur → un modèle par tâche. */
export type LlmTask = "voice" | "protocol" | "report";

/** Port LLM : les briques appellent ces méthodes, jamais un SDK en direct. */
export interface LlmProvider {
  hasLlmKey(): boolean;
  /** Modèle brut pour la boucle outillée (generateText + tools + stopWhen). */
  modelFor(task: LlmTask): LanguageModel;
  /** Objet validé par un schéma Zod (jamais de JSON parsé à la main). */
  generateObjectFor<T>(
    task: LlmTask,
    args: { system: string; prompt: string; schema: z.ZodType<T> }
  ): Promise<T>;
  /** Prose (rapport, explication) — ne fabrique aucun chiffre. */
  generateProse(task: LlmTask, args: { system: string; prompt: string }): Promise<string>;
}

// ── Port mémoire (optionnel) ───────────────────────────────────────────────
/** Port mémoire optionnel, pour un hôte qui voudrait déléguer l'indexation et
 *  la recherche sémantique à une couche externe plutôt qu'à la brique
 *  lab-memory embarquée. */
export interface MemoryPort {
  index(entry: {
    ws: Ws;
    sourceType: MemorySourceType;
    sourceId: string;
    text: string;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  search(ws: Ws, query: string, k: number): Promise<MemoryHit[]>;
}

/** Ce qu'un point d'entrée doit fournir aux briques : store, LLM, mémoire optionnelle. */
export interface Deps {
  store: Db;
  llm: LlmProvider;
  memory?: MemoryPort;
}

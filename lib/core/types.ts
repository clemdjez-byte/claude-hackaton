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

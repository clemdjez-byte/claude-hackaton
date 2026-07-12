// lib/retrieval/knowledge-graph/outcome.ts — saisie du verdict
// scientifique d'un run (succès/échec/partiel), source empirique du KG. Le verdict
// n'est PAS dérivable : seul le chercheur le connaît. Le lien Outcome→FailureMode
// (le « pourquoi ») est dérivé plus tard par l'extraction IA (extract.ts).
import { assertEnabled, type Db, type Id, type Outcome, type Quantity, type Verdict, type Ws } from "@/lib/core";

export interface SaveOutcomeInput {
  ws: Ws;
  runId: Id;
  verdict: Verdict;
  metric?: Quantity;
  reason?: string;
}

/** Enregistre le verdict saisi par le chercheur pour un run terminé. */
export async function saveOutcome(db: Db, input: SaveOutcomeInput): Promise<Outcome> {
  assertEnabled("knowledgeGraph");
  return db.insertOutcome(input);
}

/** Verdict d'un run (le plus récent), ou null si non saisi. */
export async function getOutcome(db: Db, runId: Id): Promise<Outcome | null> {
  assertEnabled("knowledgeGraph");
  return db.getOutcomeByRun(runId);
}

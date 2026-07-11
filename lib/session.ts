// lib/session.ts — la couture standalone (remplace sylvy-session.ts de Sylvy).
// Fichier hôte (hors lib/live-experiment) : a le droit d'importer l'adaptateur
// SQLite directement — c'est son rôle. Ne jamais faire cet import depuis un
// composant client ni depuis le cœur de la brique.
import { FLAGS } from "@/lib/live-experiment";
import { getDb } from "@/lib/live-experiment/adapters.standalone";
import type { Db } from "@/lib/live-experiment";

// Active les 8 briques par défaut au chargement du module : un .env peut
// toujours désactiver une brique en posant sa variable à autre chose que 'true'.
for (const envVar of Object.values(FLAGS)) {
  if (process.env[envVar] === undefined) process.env[envVar] = "true";
}

// Workspace unique du repo standalone : pas de multi-tenant, pas de segment
// de route [id] projet.
export const WS = "demo";
export const OPERATOR = "bench-operator";

export type BenchSession = { store: Db; ctx: { userId: string; ws: string } };

/** Contexte de la brique pour le repo standalone : ws et opérateur fixes. */
export function getBenchSession(): BenchSession {
  return { store: getDb(), ctx: { userId: OPERATOR, ws: WS } };
}

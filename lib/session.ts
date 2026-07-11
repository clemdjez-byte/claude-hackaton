// lib/session.ts — la couture applicative : workspace + opérateur fixes,
// résolution du store SQLite pour l'appli. Ne jamais faire cet import depuis
// un composant client ni depuis le cœur des briques.
import { FLAGS, getDb, type Db } from "@/lib/core";

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

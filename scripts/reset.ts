import { rmSync } from "node:fs";

// Respecte OCTOPUS_DB_PATH (comme lib/core/sqlite.ts) pour effacer LE fichier
// réellement utilisé par l'app, pas un chemin codé en dur.
const path = process.env.OCTOPUS_DB_PATH || "data/octopus.db";

for (const suffix of ["", "-shm", "-wal"]) {
  try {
    rmSync(`${path}${suffix}`, { force: true });
  } catch {
    /* absent = ok */
  }
}
console.log(`✓ Base réinitialisée (${path}*)`);

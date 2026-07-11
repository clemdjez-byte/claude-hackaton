import { rmSync } from "node:fs";

for (const suffix of ["", "-shm", "-wal"]) {
  try {
    rmSync(`data/octopus.db${suffix}`, { force: true });
  } catch {
    /* absent = ok */
  }
}
console.log("✓ Base réinitialisée (data/octopus.db*)");

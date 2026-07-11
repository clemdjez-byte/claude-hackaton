import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Invariant de détachabilité (plan §11) : le CŒUR de la brique (core/ + features/)
// ne doit importer AUCUN module Sylvy. Tout doit être relatif, pour qu'on puisse
// déplacer `lib/live-experiment/{core,features}` dans le repo open-source sans
// rien réécrire. Les seuls contacts Sylvy autorisés vivent dans les coutures
// (adapters.sylvy.ts, bridge.sylvy.ts, l'UI, les routes) — hors de core/ + features/.

const ROOTS = ["lib/live-experiment/core", "lib/live-experiment/features"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("détachabilité : le cœur n'importe rien de Sylvy", () => {
  it("aucun import '@/...' dans core/ ni features/ (tout relatif → extractible tel quel)", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const matches = readFileSync(file, "utf8").match(/from\s+["']@\//g);
        if (matches) offenders.push(`${file} → ${matches.length} import(s) "@/..."`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

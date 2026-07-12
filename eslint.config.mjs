import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tooling hors périmètre de l'app Next : skills gstack vendorisés (leur
    // propre suite de tests, pas du code Octopus) et octopus-mcp (paquet npm
    // séparé, son propre tsconfig/toolchain — traité en Task 8).
    ".claude/**",
    "octopus-mcp/**",
  ]),
]);

export default eslintConfig;

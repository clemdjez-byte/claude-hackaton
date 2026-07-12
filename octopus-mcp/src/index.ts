#!/usr/bin/env node
// octopus-mcp — expose Octopus à Claude Code / Claude Desktop via MCP (stdio).
// Serveur autonome : il lit la MÊME base octopus.db que l'app Next, sans dépendre
// de son runtime. Trois outils : query_lab_memory, get_run_report, list_protocols.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";

const DB_PATH = process.env.OCTOPUS_DB_PATH || "data/octopus.db";
const DEFAULT_WS = process.env.OCTOPUS_WS || "demo"; // doit matcher WS de lib/session.ts

// ── Embedder — via Voyage AI, comme l'app (lib/retrieval/embed.ts). La requête
// DOIT être vectorisée avec le MÊME modèle que les vecteurs stockés, sinon les
// espaces sont incomparables. On filtre donc les lignes par `model` (voir plus
// bas) et on embarque la requête avec ce modèle. Sans VOYAGE_API_KEY → erreur.
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3.5";
async function embedQuery(text: string, dimension: number): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY manquante : query_lab_memory ne peut pas vectoriser la requête.");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: "query", output_dimension: dimension }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Voyage embeddings a échoué (${res.status}).`);
  const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
  return json.data[0].embedding;
}
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

function openDb() {
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

const server = new McpServer({ name: "octopus", version: "1.0.0" });

server.registerTool(
  "query_lab_memory",
  {
    title: "Interroger la mémoire du labo",
    description:
      "Recherche sémantique dans la mémoire d'Octopus (runs, protocoles, observations, rapports passés). Renvoie les passages les plus pertinents avec leur source.",
    inputSchema: {
      query: z.string().describe("question en langage naturel"),
      k: z.number().int().min(1).max(10).optional().describe("nombre de résultats (défaut 5)"),
      ws: z.string().optional().describe("workspace / lab (défaut demo-lab)"),
    },
  },
  async ({ query, k, ws }) => {
    const db = openDb();
    try {
      // Ne comparer que les vecteurs du modèle actif (espaces incomparables sinon).
      const rows = db
        .prepare(`SELECT source_type, source_id, text, vector, dim FROM embedding WHERE ws = ? AND model = ?`)
        .all(ws ?? DEFAULT_WS, VOYAGE_MODEL) as Array<{ source_type: string; source_id: string; text: string; vector: string; dim: number }>;
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "Aucun résultat en mémoire (base non indexée avec ce modèle ?)." }] };
      }
      const q = await embedQuery(query, rows[0].dim);
      const hits = rows
        .map((r) => ({ ...r, score: cosine(q, JSON.parse(r.vector) as number[]) }))
        .filter((r) => r.score > 1e-9)
        .sort((a, b) => b.score - a.score)
        .slice(0, k ?? 5);
      const text = hits.length
        ? hits.map((h) => `• [${h.source_type} ${h.source_id}] (score ${h.score.toFixed(2)})\n  ${h.text}`).join("\n\n")
        : "Aucun résultat en mémoire.";
      return { content: [{ type: "text", text }] };
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  "get_run_report",
  {
    title: "Récupérer le rapport d'un run",
    description: "Renvoie le rapport auditable d'un run Octopus (prévu / réellement fait / observé / interprété, déviations, citations).",
    inputSchema: { runId: z.string().describe("identifiant du run, ex. run_xxxx") },
  },
  async ({ runId }) => {
    const db = openDb();
    try {
      const rows = db
        .prepare(`SELECT content FROM page WHERE type = 'report' AND latest = 1`)
        .all() as Array<{ content: string }>;
      const match = rows
        .map((r) => JSON.parse(r.content) as { runId?: string; protocolTitle?: string; planned?: string; performed?: string; observed?: string; interpretation?: string; deviations?: string[] })
        .find((c) => c.runId === runId);
      if (!match) return { content: [{ type: "text", text: `Aucun rapport pour ${runId}.` }] };
      const text = [
        `# Rapport — ${match.protocolTitle ?? ""} (run ${runId})`,
        `## Prévu\n${match.planned ?? ""}`,
        `## Réellement fait\n${match.performed ?? ""}`,
        `## Observé\n${match.observed ?? ""}`,
        `## Interprétation (à valider)\n${match.interpretation ?? ""}`,
        `## Déviations\n${(match.deviations ?? []).map((d) => `- ${d}`).join("\n") || "Aucune."}`,
      ].join("\n\n");
      return { content: [{ type: "text", text }] };
    } finally {
      db.close();
    }
  }
);

server.registerTool(
  "list_protocols",
  {
    title: "Lister les protocoles",
    description: "Liste les protocoles du lab (dernière version), avec leur identifiant et leur titre.",
    inputSchema: { ws: z.string().optional().describe("workspace / lab (défaut demo-lab)") },
  },
  async ({ ws }) => {
    const db = openDb();
    try {
      const rows = db
        .prepare(`SELECT id, title, version FROM page WHERE type = 'protocol' AND latest = 1 AND ws = ? ORDER BY created_at DESC`)
        .all(ws ?? DEFAULT_WS) as Array<{ id: string; title: string; version: number }>;
      const text = rows.length
        ? rows.map((r) => `• ${r.id} (v${r.version}) — ${r.title}`).join("\n")
        : "Aucun protocole.";
      return { content: [{ type: "text", text }] };
    } finally {
      db.close();
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("octopus-mcp prêt (stdio) — base :", DB_PATH);
